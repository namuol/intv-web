/**
 * Implementation approach for CP-1610, based on official CP-1600 documentation
 * from 1975 as well as community docs.
 */

import {UnreachableCaseError} from "./UnreachableCaseError";
import {Bus, BusFlags, BusDevice} from "./Bus";

let totalLogs = 0;
const trace = (..._: any[]) => {
  if (totalLogs < 400) {
    console.error(..._);
    totalLogs += 1;
  }
};

/**
 * Each micro-cycle (m-cycle) is divided into four time slots, which the CPU and
 * other bus devices use internally to decide what to do next.
 *
 * Example: The CP1610 will control the state of the bus by switching its Bus
 * Control flags on the trailing edge of the first Time Slot `ts = 0`, so bus
 * devices should only read the Bus Control flags on time slots 1,2,3.
 *
 * The data on the bus will be valid for reading depending on the current Bus
 * Control flags and the current Time Slot.
 *
 * Example: When the Bus Control flags are set to BAR (Bus to Address Register),
 * the CPU will assert the address it's reading to the bus on `ts = 3`, so Bus
 * Devices should read the address at this time.
 */
type TimeSlot = 0 | 1 | 2 | 3;

type Triplet = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Base external operations
const B: 0b000 = 0b000;
const MVO: 0b001 = 0b001;
const MVI: 0b010 = 0b010;
const ADD: 0b011 = 0b011;
const SUB: 0b100 = 0b100;
const CMP: 0b101 = 0b101;
const AND: 0b110 = 0b110;
const XOR: 0b111 = 0b111;

const HLT_OPCODE: 0b0000_0000_0000_0000 = 0b0000_0000_0000_0000;
const SDBD_OPCODE: 0b0000_0000_0000_0001 = 0b0000_0000_0000_0001;

const BusSequences = {
  //
  // INITIALIZATION
  //

  // prettier-ignore
  INITIALIZATION: [
    Bus.___,
    Bus.IAB,
    Bus.___,
    Bus.___,
    Bus.___,
  ],

  //
  // FETCH
  //

  // prettier-ignore
  INSTRUCTION_FETCH: [
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
  ],

  //
  // ADDRESS
  //

  // prettier-ignore
  ADDRESS_INDIRECT_READ: [
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
  ],
  ADDRESS_INDIRECT_READ_SDBD: [
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.BAR,
    Bus.___,
    Bus.DTB,
  ],
  // prettier-ignore
  ADDRESS_INDIRECT_WRITE: [
    Bus.BAR,
    Bus.___,
    Bus.DW,
    Bus.DWS,
    Bus.___,
  ],
  // prettier-ignore
  ADDRESS_DIRECT_READ: [
    Bus.BAR,
    Bus.___,
    Bus.ADAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
  ],
  ADDRESS_DIRECT_WRITE: [
    Bus.BAR,
    Bus.___,
    Bus.ADAR,
    Bus.___,
    Bus.DW,
    Bus.DWS,
    Bus.___,
  ],

  //
  // Special JUMP
  //
  JUMP: [
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
    Bus.___,
  ],

  //
  // Special BRANCH
  //
  // prettier-ignore
  BRANCH_SKIP: [
    Bus.___, 
    Bus.___, 
    Bus.___
  ],

  // prettier-ignore
  BRANCH_JUMP: [
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
    Bus.___
  ],

  // prettier-ignore
  EXEC_NACT_2: [
    Bus.___,
    Bus.___
  ],
  // prettier-ignore
  EXEC_NACT_4: [
    Bus.___,
    Bus.___,
    Bus.___,
    Bus.___
  ],
} as const;

export const BUS_FLAG_STRINGS = [
  "NACT",
  "ADAR",
  "IAB",
  "DTB",
  "BAR",
  "DW",
  "DWS",
  "INTAK",
] as const;

export class CP1610 implements BusDevice {
  static readonly RESET_VECTOR: number = 0x1000;

  #ts: TimeSlot = 0;
  bus: Bus;
  busSequence: keyof typeof BusSequences;
  busSequenceIndex: number;

  /**
   * The CP-1610's internal instruction register.
   */
  opcode: number = 0x0000;

  /**
   * The highest bit of the opcode (bit 9) determines whether the
   * current instruction works with the bus. Such instructions are
   * deemed "external". Otherwise the instruction works only with the
   * internals of the CPU.
   */
  #external: boolean = false;

  /**
   * Bits 6-9 actually contain the type of operation we need to
   * execute next.
   */
  #operation: Triplet = 0;

  /** Field 1 of opcode */
  #f1: Triplet = 0;

  /** Field 2 of opcode */
  #f2: Triplet = 0;

  /**
   * Used in BAR and ADAR as the address to put on the bus for read/write.
   */
  #effectiveAddress: number = 0x0000;

  #jumpOperand1: null | number = null;
  #jumpOperand2: null | number = null;
  #dtbData: number = 0xaaaa;

  /**
   * Externally-facing registers, R0-R7.
   */
  r: // Hackish: Using tuple syntax here to keep typechecking tidy:
  [number, number, number, number, number, number, number, number] =
    new Uint16Array(8) as any;

  //
  // FLAGS
  //

  /**
   * Sign Flag
   *
   * If set, indicates that the previous operation resulted in negative value,
   * which is determined by a one (1) in bit 15 of the result.
   */
  s: boolean = false;

  /**
   * Carry Flag
   *
   * If set, indicates that the previous operation resulted in unsigned integer
   * overflow.
   */
  c: boolean = false;

  /**
   * Zero Flag
   *
   * If set, indicates that the previous operation resulted in zero.
   */
  z: boolean = false;

  /**
   * Overflow Flag
   *
   * If set, indicates that the previous operation gave a signed result that is
   * inconsistent with the signs of the source operands. (Signed overflow.)
   */
  o: boolean = false;

  /**
   * Interrupt Enable Flag
   *
   * If set, allows the INTRM line to trigger an interrupt, causing the CPU to
   * jump to the interrupt subroutine located in the Executive ROM at $1004.
   */
  i: boolean = false;

  /**
   * Double Byte Data Flag
   *
   * If set, it causes the next instruction to read a 16-bit operand with two
   * 8-bit memory accesses, if it supports it.
   */
  d: boolean = false;

  halted: boolean = false;
  onInstructionFetch: (() => void) | null = null;

  constructor(bus: Bus) {
    this.bus = bus;
    this.bus.flags = Bus.___;

    this.busSequence = "INITIALIZATION";
    this.busSequenceIndex = 0;
  }

  clock(): void {
    if (this.halted) return;

    this.#ts = ((this.#ts + 1) % 4) as TimeSlot;

    const busSequence = BusSequences[this.busSequence];
    const busControl = busSequence[this.busSequenceIndex] as BusFlags;
    if (this.#ts === 0) {
      this.bus.flags = busControl;
      // trace(
      //   `${this.busSequence}[${this.busSequenceIndex}]:${BUS_FLAG_STRINGS[busControl]}`,
      // );
    }

    switch (busControl) {
      case Bus.IAB: {
        if (this.#ts === 1) {
          // Doing the write and the read here; unclear what device actually
          // asserts the reset vector so I'm just doing it all in one step,
          // here.
          this.bus.data = CP1610.RESET_VECTOR;
        } else if (this.#ts === 2) {
          this.r[7] = this.bus.data;
        }
        break;
      }
      case Bus.BAR: {
        if (
          this.onInstructionFetch &&
          this.#ts === 0 &&
          this.busSequence === "INSTRUCTION_FETCH"
        ) {
          this.onInstructionFetch();
        }

        if (this.#ts === 2) {
          let addr: number;
          switch (this.busSequence) {
            case "INITIALIZATION": {
              addr = CP1610.RESET_VECTOR;
              break;
            }
            case "ADDRESS_DIRECT_READ":
            case "ADDRESS_DIRECT_WRITE":
            case "JUMP":
            case "BRANCH_JUMP":
            case "INSTRUCTION_FETCH": {
              addr = this.r[7];
              this.r[7] += 1;
              break;
            }
            case "ADDRESS_INDIRECT_READ":
            case "ADDRESS_INDIRECT_WRITE": {
              addr = this.#effectiveAddress;
              break;
            }
            case "ADDRESS_INDIRECT_READ_SDBD": {
              addr = this.#effectiveAddress;
              this.#effectiveAddress += 1;
              break;
            }
            case "BRANCH_SKIP":
            case "EXEC_NACT_2":
            case "EXEC_NACT_4": {
              addr = 0xaaaa;
              break;
            }
            default: {
              throw new UnreachableCaseError(this.busSequence);
            }
          }
          this.bus.data = addr;
        }
        break;
      }
      case Bus.ADAR: {
        // Other bus devices should have latched address from prior `BAR`, and
        // now should assert the data at this address, which is to be treated as
        // another address in the following DTB phase.
        break;
      }
      case Bus.DTB: {
        if (this.#ts === 2) {
          switch (this.busSequence) {
            case "INSTRUCTION_FETCH": {
              this.opcode = this.bus.data;
              break;
            }
            case "JUMP": {
              if (this.#jumpOperand1 == null) {
                this.#jumpOperand1 = this.bus.data;
              } else if (this.#jumpOperand2 == null) {
                this.#jumpOperand2 = this.bus.data;
              }
              break;
            }
            case "INITIALIZATION":
            case "ADDRESS_DIRECT_READ":
            case "ADDRESS_DIRECT_WRITE":
            case "ADDRESS_INDIRECT_READ":
            case "ADDRESS_INDIRECT_WRITE":
            case "BRANCH_SKIP":
            case "BRANCH_JUMP":
            case "EXEC_NACT_2":
            case "EXEC_NACT_4": {
              this.#dtbData = this.bus.data;
              break;
            }
            case "ADDRESS_INDIRECT_READ_SDBD": {
              if (this.busSequenceIndex === 2) {
                this.#dtbData = this.bus.data & 0x00ff;
              } else {
                this.#dtbData |= (this.bus.data & 0x00ff) << 8;
              }
              break;
            }
            default: {
              throw new UnreachableCaseError(this.busSequence);
            }
          }
        }
        break;
      }
      case Bus.DW:
      case Bus.DWS: {
        this.bus.data = this.r[this.#f2];
        break;
      }
      case Bus.INTAK: {
        break;
      }
      case Bus.___: {
        break;
      }
      default: {
        throw new UnreachableCaseError(busControl);
      }
    }

    // If we're at the end of the micro-cycle...
    if (this.#ts === 3) {
      // ...enter the next step in the bus sequence:
      this.busSequenceIndex += 1;

      // If we're at the end of our bus sequence...
      if (this.busSequenceIndex >= busSequence.length) {
        // ...decode the next bus sequence to run:
        this.busSequenceIndex = 0;
        switch (this.busSequence) {
          case "INITIALIZATION": {
            this.busSequence = "INSTRUCTION_FETCH";
            break;
          }
          case "EXEC_NACT_2":
          case "EXEC_NACT_4":
          case "ADDRESS_INDIRECT_READ":
          case "ADDRESS_INDIRECT_READ_SDBD":
          case "ADDRESS_INDIRECT_WRITE":
          case "ADDRESS_DIRECT_READ":
          case "ADDRESS_DIRECT_WRITE":
          case "JUMP":
          case "BRANCH_SKIP":
          case "BRANCH_JUMP": {
            //
            // EXECUTE INSTRUCTION
            //

            // trace("EXECUTING INSTRUCTION", {
            //   opcode: this.opcode.toString(16).padStart(4, "0"),
            //   external: this.#external,
            //   operation: this.#operation.toString(2).padStart(3, "0"),
            //   f1: this.#f1.toString(2).padStart(3, "0"),
            //   f2: this.#f2.toString(2).padStart(3, "0"),
            //   effectiveAddress: this.#effectiveAddress
            //     .toString(16)
            //     .padStart(4, "0"),
            // });

            if (this.#external) {
              switch (this.#operation) {
                case B: {
                  if (this.busSequence === "BRANCH_JUMP") {
                    const direction =
                      0b0000_0000_0010_0000 & this.opcode ? -1 : 1;
                    this.r[7] +=
                      direction * (this.#dtbData + (direction > 0 ? 0 : 1));
                  } else {
                    this.r[7] += 1;
                  }
                  break;
                }
                case MVO: {
                  break;
                }
                case MVI: {
                  this.r[this.#f2] = this.#dtbData;
                  break;
                }
                case ADD: {
                  break;
                }
                case SUB: {
                  break;
                }
                case CMP: {
                  break;
                }
                case AND: {
                  const i = this.#f2;
                  this.r[i] &= this.#dtbData;
                  this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                  this.z = this.r[i] === 0;
                  break;
                }
                case XOR: {
                  const i = this.#f2;
                  this.r[i] ^= this.#dtbData;
                  this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                  this.z = this.r[i] === 0;
                  break;
                }
                default: {
                  throw new UnreachableCaseError(this.#operation);
                }
              }
            } else {
              switch (this.#operation) {
                // These indicate single-register operations, which have a
                // secondary opcode within f1:
                case 0b000: {
                  switch (this.#f1) {
                    case 0b000: {
                      switch (this.#f2) {
                        case 0b100: /* J */ {
                          // Special case: `0000 000` indicates a jump instruction:
                          const rr =
                            (0b0000_0011_0000_0000 & this.#jumpOperand1!) >> 8;
                          const ff =
                            0b0000_0000_0000_0011 & this.#jumpOperand1!;
                          const aaaaaaaaaaaaaaaa =
                            ((0b0000_0000_1111_1100 & this.#jumpOperand1!) <<
                              8) |
                            (0b0000_0011_1111_1111 & this.#jumpOperand2!);

                          let regIndex = null;
                          switch (rr) {
                            case 0b00:
                              regIndex = 4;
                              break;
                            case 0b01:
                              regIndex = 5;
                              break;
                            case 0b10:
                              regIndex = 6;
                              break;
                          }
                          if (regIndex != null) {
                            this.r[regIndex] = this.r[7];
                          }
                          if (ff === 0b01) this.i = true;
                          if (ff === 0b10) this.i = false;
                          // trace("jumping", {
                          //   external: this.#external,
                          //   operation: this.#operation,
                          //   f1: this.#f1,
                          //   opcode: this.opcode,
                          //   aaaaaaaaaaaaaaaa,
                          //   j1: this.#jumpOperand1,
                          //   j2: this.#jumpOperand2,
                          //   busSequence: this.busSequence,
                          //   busSequenceIndex: this.busSequenceIndex,
                          //   'this.i': this.i,
                          // });
                          this.r[7] = aaaaaaaaaaaaaaaa;
                          break;
                        }
                        // These are all 4-cycle operations which are handled at
                        // the end of the `INSTRUCTION_FETCH`
                        case 0b000:
                        case 0b001:
                        case 0b010:
                        case 0b011:
                        case 0b101:
                        case 0b110:
                        case 0b111: {
                          break;
                        }

                        default: {
                          throw new UnreachableCaseError(this.#f2);
                        }
                      }
                      break;
                    }

                    case 0b001: /* INCR */ {
                      const i = this.#f2;
                      this.r[i] += 1;
                      this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                      this.z = this.r[i] === 0;
                      break;
                    }
                    case 0b010: /* DECR */ {
                      const i = this.#f2;
                      this.r[i] -= 1;
                      this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                      this.z = this.r[i] === 0;
                      break;
                    }
                    case 0b011: /* COMR */ {
                      const i = this.#f2;
                      this.r[i] ^= 0xffff;
                      this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                      this.z = this.r[i] === 0;
                      break;
                    }
                    case 0b100: /* NEGR */ {
                      const i = this.#f2;
                      this.c = this.r[i] === 0x0000;
                      this.o = this.r[i] === 0x8000;
                      this.r[i] *= -1;
                      this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                      this.z = this.r[i] === 0;
                      break;
                    }
                    case 0b101: /* ADCR */ {
                      const i = this.#f2;
                      if (this.c) {
                        this.o = this.r[i] === 0x7fff;
                        this.c = this.r[i] === 0xffff;
                        this.r[i] += 1;
                      }
                      this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                      this.z = this.r[i] === 0;
                      break;
                    }
                    case 0b110: {
                      switch (this.#f2) {
                        case 0b000:
                        case 0b001:
                        case 0b010:
                        case 0b011: /* GSWD */ {
                          const i = this.#f2;
                          // prettier-ignore
                          const flags = (this.s ? 0b1000 : 0)
                                      | (this.z ? 0b0100 : 0)
                                      | (this.o ? 0b0010 : 0)
                                      | (this.c ? 0b0001 : 0);
                          this.r[i] = (flags << 4) | (flags << 12);
                          break;
                        }
                        case 0b100:
                        case 0b101:
                        case 0b110:
                        case 0b111: {
                          // NOP
                          break;
                        }
                        default: {
                          throw new UnreachableCaseError(this.#f2);
                        }
                      }

                      break;
                    }
                    case 0b111: /* RSWD */ {
                      const flags =
                        (this.r[this.#f2] & 0b0000_0000_1111_0000) >> 4;
                      this.s = !!(flags & 0b1000);
                      this.z = !!(flags & 0b0100);
                      this.o = !!(flags & 0b0010);
                      this.c = !!(flags & 0b0001);
                      break;
                    }
                    default: {
                      throw new UnreachableCaseError(this.#f1);
                    }
                  }
                  break;
                }
                // Register shift operations break down the opcode differently
                // so we have special logic for them here:
                case 0b001: {
                  const i = (0b011 & this.#f2) as Triplet;
                  const r = this.r[i];
                  const rightShift = Boolean(0b100 & this.#f1);
                  const withLinkBits = Boolean(0b010 & this.#f1);
                  const arithmetic = Boolean(0b001 & this.#f1);
                  const shiftTwice = Boolean(0b100 & this.#f2);

                  let signBit;
                  if (this.#f1 === 0b000) {
                    // SWAP
                    signBit = 0b0000_0000_1000_0000;
                    const lo = this.r[i] & 0x00ff;
                    if (shiftTwice) {
                      this.r[i] = lo | (lo << 8);
                    } else {
                      const hi = this.r[i] & 0xff00;
                      this.r[i] = (hi >> 8) | (lo << 8);
                    }
                  } else {
                    const shift = shiftTwice ? 2 : 1;
                    signBit = rightShift
                      ? 0b0000_0000_1000_0000
                      : 0b1000_0000_0000_0000;

                    const c = Number(this.c && !arithmetic);
                    const o = Number(this.o && !arithmetic);

                    if (withLinkBits) {
                      const carryBit = rightShift
                        ? 0b0000_0000_0000_0001
                        : 0b1000_0000_0000_0000;
                      this.c = Boolean(r & carryBit);
                      if (shiftTwice) {
                        const overflowBit = rightShift
                          ? 0b0000_0000_0000_0010
                          : 0b0100_0000_0000_0000;
                        this.o = Boolean(r & overflowBit);
                      }
                    }

                    if (!rightShift) {
                      this.r[i] =
                        (r << shift) | (c << (shift - 1)) | (o << (shift - 2));
                    } else {
                      if (arithmetic) {
                        let signBits = 0b1000_0000_0000_0000 & r;
                        if (shiftTwice) {
                          signBits |= signBits >> 1;
                        }
                        this.r[i] = signBits | (r >> shift);
                      } else if (withLinkBits) {
                        this.r[i] =
                          (r >> shift) |
                          (c << (16 - shift)) |
                          (o << (17 - shift));
                      } else {
                        this.r[i] = r >> shift;
                      }
                    }
                  }
                  this.s = (this.r[i] & signBit) !== 0;
                  this.z = this.r[i] === 0;

                  break;
                }
                // The rest of these operations are register to register
                // operations:
                case 0b010: {
                  /* MOVR */
                  const i = this.#f2;
                  this.r[i] = this.r[this.#f1];
                  this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                  this.z = this.r[i] === 0;
                  break;
                }
                case 0b011: /* ADDR */ {
                  const r1 = this.r[this.#f1];
                  const r2 = this.r[this.#f2];
                  const result = r1 + r2;
                  this.r[this.#f2] = result;
                  this.c = result > 0xffff;
                  this.s = (this.r[this.#f2] & 0b1000_0000_0000_0000) !== 0;
                  this.o =
                    (0x8000 & r1) === (0x8000 & r2) &&
                    this.s !== Boolean(0x8000 & r1);
                  this.z = this.r[this.#f2] === 0;
                  break;
                }
                case 0b100: /* SUBR */
                case 0b101: /* CMPR */ {
                  const r1 = this.r[this.#f1];
                  const r2 = this.r[this.#f2];
                  const result = r2 - r1;
                  this.c = r2 >= r1;
                  this.s = (result & 0b1000_0000_0000_0000) !== 0;
                  this.z = result === 0;
                  this.o =
                    (0x8000 & r1) !== (0x8000 & r2) &&
                    this.s === Boolean(0x8000 & r1);

                  if (this.#operation === 0b100) {
                    this.r[this.#f2] = result;
                  }
                  break;
                }
                case 0b110: /* ANDR */ {
                  const i = this.#f2;
                  this.r[i] &= this.r[this.#f1];
                  this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                  this.z = this.r[i] === 0;
                  break;
                }
                case 0b111: /* XORR */ {
                  const i = this.#f2;
                  this.r[i] ^= this.r[this.#f1];
                  this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
                  this.z = this.r[i] === 0;
                  break;
                }
                default: {
                  throw new UnreachableCaseError(this.#operation);
                }
              }
            }

            // Most sequences go straight into fetching the next instruction:
            this.busSequence = "INSTRUCTION_FETCH";
            this.#jumpOperand1 = null;
            this.#jumpOperand2 = null;
            break;
          }
          case "INSTRUCTION_FETCH": {
            // After we've fetched our instruction, we need to decode what to do
            // next by looking at the opcode we just read.
            if (this.opcode === SDBD_OPCODE) {
              this.d = true;
              break;
            }

            // prettier-ignore
            {
              this.#external = Boolean((0b000000_1000_000_000 & this.opcode));
              this.#operation = /* */ ((0b000000_0111_000_000 & this.opcode) >> 6) as Triplet;
              this.#f1 = /*        */ ((0b000000_0000_111_000 & this.opcode) >> 3) as Triplet;
              this.#f2 = /*        */ ((0b000000_0000_000_111 & this.opcode) >> 0) as Triplet;
            }

            if (this.#external) {
              const indirect = this.#f1 !== 0b000;
              switch (this.#operation) {
                case B: {
                  let condition = false;
                  switch (this.#f2) {
                    // B / NOPP
                    case 0b000: {
                      condition = true;
                      break;
                    }
                    // BC / BNC
                    case 0b001: {
                      condition = this.c;
                      break;
                    }
                    // BOV / BNOV
                    case 0b010: {
                      condition = this.o;
                      break;
                    }
                    // BPL / BMI
                    case 0b011: {
                      condition = !this.s;
                      break;
                    }
                    // BEQ / BNEQ
                    case 0b100: {
                      condition = this.z;
                      break;
                    }
                    // BLT / BGE
                    case 0b101: {
                      condition = this.s !== this.o;
                      break;
                    }
                    // BLE / BGT
                    case 0b110: {
                      condition = this.z || this.s !== this.o;
                      break;
                    }
                    // BUSC / BESC
                    case 0b111: {
                      condition = this.s !== this.c;
                      break;
                    }
                  }

                  if (0b0000_0000_0000_1000 & this.opcode) {
                    condition = !condition;
                  }

                  if (condition) {
                    this.busSequence = "BRANCH_JUMP";
                  } else {
                    this.busSequence = "BRANCH_SKIP";
                  }
                  break;
                }
                case MVO: {
                  this.busSequence = indirect
                    ? "ADDRESS_INDIRECT_WRITE"
                    : "ADDRESS_DIRECT_WRITE";
                  break;
                }
                case MVI:
                case ADD:
                case SUB:
                case CMP:
                case AND:
                case XOR: {
                  this.busSequence = indirect
                    ? "ADDRESS_INDIRECT_READ"
                    : "ADDRESS_DIRECT_READ";
                  break;
                }
                default: {
                  throw new UnreachableCaseError(this.#operation);
                }
              }

              // Handle effective address calculation and pre/post
              // incrementation of registers:
              if (this.#operation !== B) {
                // CP1600 docs say that SDBD is not supported for anything but
                // R1, R2, R3, R4, and R5, but we assume double
                // increment/decrement behavior regardless here.
                const offset = this.d ? 2 : 1;
                switch (this.#f1) {
                  case 1:
                  case 2:
                  case 3: {
                    // Destination register R1-R3, no post-increment
                    this.#effectiveAddress = this.r[this.#f1];
                    break;
                  }
                  case 4:
                  case 5:
                  case 7: {
                    // Destination register R4, R5, or R7, post-increment
                    this.#effectiveAddress = this.r[this.#f1];
                    this.r[this.#f1] += offset;
                    break;
                  }
                  case 6: {
                    // Stack mode

                    // If input operation, pre-decrement R6
                    if (this.#operation === MVI) {
                      this.r[this.#f1] -= offset;
                    }

                    this.#effectiveAddress = this.r[this.#f1];

                    // If output operation, post-increment R6
                    if (this.#operation === MVO) {
                      this.r[this.#f1] += offset;
                    }
                  }
                }
              }

              if (this.d && this.busSequence === "ADDRESS_INDIRECT_READ") {
                this.busSequence = "ADDRESS_INDIRECT_READ_SDBD";
              }
            } else {
              switch (this.#operation) {
                // These indicate single-register operations, which have a
                // secondary opcode within f1:
                case 0b000: {
                  switch (this.#f1) {
                    case 0b000: {
                      // These indicate internal control operations.
                      //
                      // With the exception of Jump, all of these are 4-cycle
                      // operations, which means we need to execute immediately.
                      switch (this.#f2) {
                        case 0b100: /* J */ {
                          // Special case: `0000 000 100` indicates a jump instruction:
                          this.busSequence = "JUMP";
                          break;
                        }
                        case 0b000: /* HLT */ {
                          this.halted = true;
                          break;
                        }
                        case 0b001: /* SDBD */ {
                          // We handle this at the start of the
                          // `INSTRUCTION_FETCH` case block
                          break;
                        }
                        case 0b010: /* EIS */ {
                          this.i = true;
                          break;
                        }
                        case 0b011: /* DIS */ {
                          this.i = false;
                          break;
                        }
                        case 0b101: /* TCI */ {
                          break;
                        }
                        case 0b110: /* CLRC */ {
                          this.c = false;
                          break;
                        }
                        case 0b111: /* SETC */ {
                          this.c = true;
                          break;
                        }

                        default: {
                          throw new UnreachableCaseError(this.#f2);
                        }
                      }
                      break;
                    }
                    case 0b001: /* INCR */
                    case 0b010: /* DECR */
                    case 0b011: /* COMR */
                    case 0b100: /* NEGR */
                    case 0b101: /* ADCR */
                    case 0b110: /* GSWD */
                    case 0b111: /* RSWD */ {
                      // All of these operations take up 6 cycles, 4 for
                      // instruction fetch as usual, plus what I *assume* are
                      // two NACTs during execution.
                      this.busSequence = "EXEC_NACT_2";
                      break;
                    }
                    default: {
                      throw new UnreachableCaseError(this.#f1);
                    }
                  }
                  break;
                }
                // Register shift operations break down the opcode differently
                // so we have special logic for them here:
                case 0b001: {
                  const shiftTwice = 0b100 & this.#f2;
                  this.busSequence = shiftTwice ? "EXEC_NACT_4" : "EXEC_NACT_2";
                  break;
                }
                // The rest of these operations are register to register
                // operations:
                case 0b010: /* MOVR */
                case 0b011: /* ADDR */
                case 0b100: /* SUBR */
                case 0b101: /* CMPR */
                case 0b110: /* ANDR */
                case 0b111: /* XORR */ {
                  // Register-to-register operations tend to take ~6 cycles, so
                  // 4 for instruction fetch + 2
                  //
                  // TODO: MOVR can take an extra cycle if the destination
                  // register is 6 or 7
                  this.busSequence = "EXEC_NACT_2";
                  break;
                }
                default: {
                  throw new UnreachableCaseError(this.#operation);
                }
              }
            }
            if ((this.r[7] - 1) === 0x4aa5) {
              trace("DECODED INSTRUCTION", {
                opcode: this.opcode.toString(16).padStart(4, "0"),
                external: this.#external,
                operation: this.#operation.toString(2).padStart(3, "0"),
                f1: this.#f1.toString(2).padStart(3, "0"),
                f2: this.#f2.toString(2).padStart(3, "0"),
                effectiveAddress: this.#effectiveAddress
                  .toString(16)
                  .padStart(4, "0"),
                busSequence: this.busSequence,
                busSequenceIndex: this.busSequenceIndex,
                bus: this.bus.toString(),
              });
            }
            if (this.opcode !== SDBD_OPCODE) {
              this.d = false;
            }

            break;
          }

          default: {
            throw new UnreachableCaseError(this.busSequence);
          }
        }
      }
    }
  }

  debug_read(_addr: number): number | null {
    return null;
  }
}
