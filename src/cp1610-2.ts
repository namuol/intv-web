/**
 * Alternate implementation approach for CP-1610, based on official CP-1600
 * documentation from 1975.
 */

import {UnreachableCaseError} from "./UnreachableCaseError";
import {Bus, BusDevice, BusFlags, CP1610} from "./cp1610";

let totalLogs = 0;
const trace = (..._: any[]) => {
  if (totalLogs < 15) {
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
    Bus.___,
    Bus.___,
    Bus.___,
  ],
} as const;

export class CP1610_2 implements BusDevice {
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
  #operation: number = 0;

  /** Field 1 of opcode */
  #f1: number = 0;

  /** Field 2 of opcode */
  #f2: number = 0;

  /**
   * Used in BAR and ADAR as the address to put on the bus for read/write.
   */
  #effectiveAddress: number = 0x0000;

  #jumpOperand1: null | number = null;
  #jumpOperand2: null | number = null;

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

  constructor(bus: Bus) {
    this.bus = bus;
    this.bus.flags = Bus.___;

    this.busSequence = "INITIALIZATION";
    this.busSequenceIndex = 0;
  }

  clock(): void {
    this.#ts = ((this.#ts + 1) % 4) as TimeSlot;
    // if (this.#ts === 0) {
    //   console.log(this.busSequence, this.busSequenceIndex);
    // }
    const busSequence = BusSequences[this.busSequence];
    const busControl = busSequence[this.busSequenceIndex] as BusFlags;
    if (this.#ts === 0) this.bus.flags = busControl;

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
        if (this.#ts === 2) {
          this.bus.data = this.r[7];
          this.r[7] += 1;
        }
        break;
      }
      case Bus.ADAR: {
        break;
      }
      case Bus.DTB: {
        if (this.#ts === 2) {
          if (this.busSequence === "INSTRUCTION_FETCH") {
            this.opcode = this.bus.data;
          } else if (this.busSequence === "JUMP") {
            if (this.#jumpOperand1 == null) {
              this.#jumpOperand1 = this.bus.data;
            } else if (this.#jumpOperand2 == null) {
              this.#jumpOperand2 = this.bus.data;
            }
          }
        }
        break;
      }
      case Bus.DW: {
        break;
      }
      case Bus.DWS: {
        break;
      }
      case Bus.INTAK: {
        break;
      }
      case Bus.___: {
        break;
      }
      default: {
        console.error(this);
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
          case "INITIALIZATION":
          case "ADDRESS_INDIRECT_READ":
          case "ADDRESS_INDIRECT_WRITE":
          case "ADDRESS_DIRECT_READ":
          case "ADDRESS_DIRECT_WRITE":
          case "JUMP": {
            // Handle jump - TODO: verify timing of this
            if (this.busSequence === "JUMP") {
              const rr = (0b0000_0011_0000_0000 & this.#jumpOperand1!) >> 8;
              const ff = 0b0000_0000_0000_0011 & this.#jumpOperand1!;
              const aaaaaaaaaaaaaaaa =
                ((0b0000_0000_1111_1100 & this.#jumpOperand1!) << 8) |
                (0b0000_0011_1111_1111 & this.#jumpOperand2!);

              let regIndex = null;
              switch (rr) {
                case 0b00: {
                  regIndex = 4;
                  break;
                }
                case 0b01: {
                  regIndex = 5;
                  break;
                }
                case 0b10: {
                  regIndex = 6;
                  break;
                }
              }
              if (regIndex != null) {
                this.r[regIndex] = this.r[7];
              }
              if (ff === 0b01) this.i = true;
              if (ff === 0b10) this.i = false;
              this.r[7] = aaaaaaaaaaaaaaaa;
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

            // prettier-ignore
            this.#external = Boolean((0b000000_1000_000_000 & this.opcode) >> 9);
            this.#operation = /*  */ (0b000000_0111_000_000 & this.opcode) >> 6;
            this.#f1 = /*         */ (0b000000_0000_111_000 & this.opcode) >> 3;
            this.#f2 = /*         */ (0b000000_0000_000_111 & this.opcode) >> 0;

            trace("DECODING INSTRUCTION", {
              opcode: this.opcode.toString(16).padStart(4, "0"),
              external: this.#external,
              operation: this.#operation.toString(2).padStart(3, "0"),
              f1: this.#f1.toString(2).padStart(3, "0"),
              f2: this.#f2.toString(2).padStart(3, "0"),
            });

            if (this.#external) {
              const indirect = this.#f1 !== 0b000;
              // prettier-ignore
              switch (this.#operation) {
                // case 0b000: /* B** */ this.busSequence = "BRANCH"; break;
                case 0b001: /* MVO */ this.busSequence = indirect ? "ADDRESS_INDIRECT_WRITE"  : "ADDRESS_DIRECT_WRITE"; break;
                case 0b010: /* MVI */ this.busSequence = indirect ? "ADDRESS_INDIRECT_READ"   : "ADDRESS_DIRECT_READ";  break;
                case 0b011: /* ADD */ this.busSequence = indirect ? "ADDRESS_INDIRECT_READ"   : "ADDRESS_DIRECT_READ";  break;
                case 0b100: /* SUB */ this.busSequence = indirect ? "ADDRESS_INDIRECT_READ"   : "ADDRESS_DIRECT_READ";  break;
                case 0b101: /* CMP */ this.busSequence = indirect ? "ADDRESS_INDIRECT_READ"   : "ADDRESS_DIRECT_READ";  break;
                case 0b110: /* AND */ this.busSequence = indirect ? "ADDRESS_INDIRECT_READ"   : "ADDRESS_DIRECT_READ";  break;
                case 0b111: /* XOR */ this.busSequence = indirect ? "ADDRESS_INDIRECT_READ"   : "ADDRESS_DIRECT_READ";  break;
              }
            } else {
              // prettier-ignore
              switch (this.#operation) {
                // These indicate single-register operations, which have a
                // secondary opcode within f1:
                case 0b000: {
                  switch (this.#f1) {
                    case 0b000: {
                      // Special case: `0000 000` indicates a jump instruction:
                      this.busSequence = "JUMP";
                      break;
                    }
                    case 0b001: break;
                    case 0b010: break;
                    case 0b011: break;
                    case 0b100: break;
                    case 0b101: break;
                    case 0b110: break;
                    case 0b111: break;
                  }
                  break;
                }
                // Register shift operations break down the opcode differently
                // so we have special logic for them here:
                case 0b001: {
                  break;
                }
                // The rest of these operations are register to register
                // operations:
                case 0b010: /* MOVR */ break;
                case 0b011: /* ADDR */ break;
                case 0b100: /* SUBR */ break;
                case 0b101: /* CMPR */ break;
                case 0b110: /* ANDR */ break;
                case 0b111: /* XORR */ break;
              }
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
