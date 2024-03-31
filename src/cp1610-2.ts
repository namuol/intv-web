/**
 * Alternate implementation approach for CP-1610, based on official CP-1600
 * documentation from 1975.
 */

import {UnreachableCaseError} from "./UnreachableCaseError";
import {Bus, BusDevice, BusFlags, CP1610} from "./cp1610";

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
  // prettier-ignore
  INITIALIZATION: [
    Bus.___,
    Bus.IAB,
    Bus.___,
    Bus.___,
    Bus.___,
  ],
  // prettier-ignore
  INSTRUCTION_FETCH: [
    Bus.BAR,
    Bus.___,
    Bus.DTB,
    Bus.___,
  ],
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
  // prettier-ignore
  ADDRESS_DIRECT_WRITE: [
    Bus.BAR,
    Bus.___,
    Bus.ADAR,
    Bus.___,
    Bus.DW,
    Bus.DWS,
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
          case "ADDRESS_DIRECT_WRITE": {
            // Most sequences go straight into fetching the next instruction:
            this.busSequence = "INSTRUCTION_FETCH";
            break;
          }
          case "INSTRUCTION_FETCH": {
            // After we've fetched our instruction, we need to decode what to do
            // next by looking at the opcode we just read.

            // prettier-ignore
            this.#external = Boolean(0b000000_1000_000_000 & (this.opcode >> 9));
            this.#operation = /*  */ 0b000000_0111_000_000 & (this.opcode >> 6);
            this.#f1 = /*         */ 0b000000_0000_111_000 & (this.opcode >> 3);
            this.#f2 = /*         */ 0b000000_0000_000_111 & (this.opcode >> 0);

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
