import {Bus, BusDevice} from "./Bus";
import {Mnemonic, InstructionConfig} from "./InstructionConfig";
import {UnreachableCaseError} from "./UnreachableCaseError";
import {decodeOpcode} from "./decodeOpcode";
import {trace} from "./trace";

/**
 * Internal state of the CPU. This is essentially half of a state machine; the
 * rest of the state machine implementation lives in the `cycle` method of the
 * CPU.
 *
 * The state is primarily used to control interactions with the bus.
 *
 * For comprehensive documentation on this key part of the CPU, I highly
 * recommend reading Spatula City's
 * [guide](http://spatula-city.org/~im14u2c/intv/tech/master.html).
 *
 * A (simplified and somewhat incomplete) graphical representation of the state
 * machine can be viewed
 * [here](http://spatula-city.org/~im14u2c/intv/tech/state_flow_diag.html).
 */
type CpuState =
  | "RESET:IAB"
  | "RESET:NACT"
  //
  | "FETCH_OPCODE:BAR"
  | "FETCH_OPCODE:NACT_0"
  | "FETCH_OPCODE:DTB"
  | "FETCH_OPCODE:NACT_1"
  // AKA immediate mode when 000 is specified for the register to read an
  // address from:
  | "INDIRECT_READ:BAR"
  | "INDIRECT_READ:NACT_0"
  | "INDIRECT_READ:DTB"
  | "INDIRECT_READ:NACT_1"
  //
  | "INDIRECT_WRITE:BAR"
  | "INDIRECT_WRITE:NACT_0"
  | "INDIRECT_WRITE:DW"
  | "INDIRECT_WRITE:DWS"
  | "INDIRECT_WRITE:NACT_1"
  //
  | "INDIRECT_SDBD_READ:BAR"
  | "INDIRECT_SDBD_READ:NACT_0"
  | "INDIRECT_SDBD_READ:DTB"
  | "INDIRECT_SDBD_READ:BAR"
  | "INDIRECT_SDBD_READ:NACT_1"
  | "INDIRECT_SDBD_READ:DTB"
  //
  | "DIRECT_READ:BAR"
  | "DIRECT_READ:NACT_0"
  | "DIRECT_READ:ADAR"
  | "DIRECT_READ:NACT_1"
  | "DIRECT_READ:DTB"
  | "DIRECT_READ:NACT_2"
  //
  | "DIRECT_WRITE:BAR"
  | "DIRECT_WRITE:NACT_0"
  | "DIRECT_WRITE:ADAR"
  | "DIRECT_WRITE:NACT_1"
  | "DIRECT_WRITE:DW"
  | "DIRECT_WRITE:DWS"
  | "DIRECT_WRITE:NACT_2"
  //
  | "INTERRUPT:INTAK"
  | "INTERRUPT:NACT_0"
  | "INTERRUPT:DW"
  | "INTERRUPT:DWS"
  | "INTERRUPT:NACT_1"
  | "INTERRUPT:IAB"
  | "INTERRUPT:NACT_2"
  // Jump instructions take 12 cycles, and we need to read 2 words following the
  // PC. In theory, this should be done with a pair of INDIRECT_READs, but those
  // would only make up 8 cycles, so I'm padding the end of the state machine
  // with extra NACTs.
  //
  // Note: The "JR" instruction is actually a MOVR, which takes 7 cycles, as
  // opposed to the typical 12 cycles taken by true JUMP instructions.
  //
  // From the Wiki docs:
  //
  // > Move instructions are sometimes used with the program counter. "MOVR R5,
  // > R7" will jump to the location whose address is in R5. The assembler
  // > offers a pseudonym for this, "JR". The instruction "JR R5" is equivalent
  // > to "MOVR R5, R7."
  | "JUMP:BAR_0"
  | "JUMP:NACT_0"
  | "JUMP:DTB_0"
  | "JUMP:NACT_1"
  | "JUMP:BAR_1"
  | "JUMP:NACT_2"
  | "JUMP:DTB_1"
  | "JUMP:NACT_3"
  | "JUMP:NACT_4"
  | "JUMP:NACT_5"
  | "JUMP:NACT_6"
  | "JUMP:NACT_7"
  //
  | "BRANCH_READ_OFFSET:BAR_0"
  | "BRANCH_READ_OFFSET:NACT_0"
  | "BRANCH_READ_OFFSET:DTB_0"
  | "BRANCH_READ_OFFSET:NACT_1"
  | "BRANCH_READ_OFFSET:NACT_2"
  | "BRANCH_READ_OFFSET:NACT_3"
  | "BRANCH_READ_OFFSET:NACT_4"
  //
  | "BRANCH_JUMP:NACT_0"
  | "BRANCH_JUMP:NACT_1";

const INSTRUCTION_STATES: Record<Mnemonic, CpuState> = {
  HLT: "INDIRECT_READ:BAR",
  SDBD: "INDIRECT_READ:BAR",
  EIS: "INDIRECT_READ:BAR",
  DIS: "INDIRECT_READ:BAR",
  J: "JUMP:BAR_0",
  TCI: "INDIRECT_READ:BAR",
  CLRC: "INDIRECT_READ:BAR",
  SETC: "INDIRECT_READ:BAR",
  INCR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  DECR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  COMR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  NEGR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  ADCR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  GSWD: "INDIRECT_READ:BAR",
  NOP: "INDIRECT_READ:BAR",
  SIN: "INDIRECT_READ:BAR",
  RSWD: "INDIRECT_READ:BAR",
  SWAP: "INDIRECT_READ:BAR",
  SLL: "INDIRECT_READ:BAR",
  RLC: "INDIRECT_READ:BAR",
  SLLC: "INDIRECT_READ:BAR",
  SLR: "INDIRECT_READ:BAR",
  SAR: "INDIRECT_READ:BAR",
  RRC: "INDIRECT_READ:BAR",
  SARC: "INDIRECT_READ:BAR",
  MOVR: "INDIRECT_READ:BAR",
  ADDR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  SUBR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  CMPR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  ANDR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  XORR: "INDIRECT_READ:NACT_1", // Do we need a state just for executing an instruction for <N> NACTs?
  B: "BRANCH_READ_OFFSET:BAR_0",
  MVO: "INDIRECT_READ:BAR",
  "MVO@": "INDIRECT_WRITE:BAR",
  MVOI: "INDIRECT_WRITE:BAR",
  MVI: "INDIRECT_READ:BAR",
  "MVI@": "INDIRECT_READ:BAR",
  MVII: "INDIRECT_READ:BAR",
  ADD: "INDIRECT_READ:BAR",
  "ADD@": "INDIRECT_READ:BAR",
  ADDI: "INDIRECT_READ:BAR",
  SUB: "INDIRECT_READ:BAR",
  "SUB@": "INDIRECT_READ:BAR",
  SUBI: "INDIRECT_READ:BAR",
  CMP: "INDIRECT_READ:BAR",
  "CMP@": "INDIRECT_READ:BAR",
  CMPI: "INDIRECT_READ:BAR",
  AND: "INDIRECT_READ:BAR",
  "AND@": "INDIRECT_READ:BAR",
  ANDI: "INDIRECT_READ:BAR",
  XOR: "INDIRECT_READ:BAR",
  "XOR@": "INDIRECT_READ:BAR",
  XORI: "INDIRECT_READ:BAR",
};

type RegisterIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Emulation of the General Instruments CP1610 microprocessor, as used in the
 * Intellivision and Intellvision II home video game consoles.
 */
export class CP1610 implements BusDevice {
  static readonly RESET_VECTOR: number = 0x1000;

  //
  // REGISTERS
  //

  // Hackish: Using tuple syntax here to keep typechecking tidy:
  r: [number, number, number, number, number, number, number, number] =
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

  bus: Bus;

  /**
   * The last opcode read from the program counter's location.
   */
  opcode: number = 0x0000;
  /**
   * Arguments that have been read from memory for current instruction (if
   * applicable)
   */
  args: [number, number] = new Uint16Array(2) as any;
  /**
   * The current instruction decoded from the last read opcode.
   */
  instruction: null | InstructionConfig = null;
  /**
   * The previous instruction
   */
  prevInstruction: null | InstructionConfig = null;
  ticks: number = 0;

  constructor(bus: Bus) {
    this.bus = bus;
    this._reset();
  }

  debug_read(_: number): number | null {
    return null;
  }

  _reset() {
    this.state = "RESET:IAB";
    this.r[7] = CP1610.RESET_VECTOR;
  }

  state: CpuState = "RESET:IAB";

  clock() {
    // trace(this.state);
    this.ticks = (this.ticks + 1) % 4;

    switch (this.state) {
      case "RESET:IAB": {
        if (this.ticks === 0) {
          // this.bus.data = CP1610.RESET;
          this.bus.flags = Bus.IAB;
          return;
        }
        if (this.ticks !== 3) return;
        // Entered into on the first cycle after coming out of RESET. During
        // this phase, an external device should assert the address of the RESET
        // vector as appropriate. The CPU then moves this address into the
        // program counter and resumes execution. this.r[7] = this.bus.data;
        this.r[7] = CP1610.RESET_VECTOR;
        this.state = "RESET:NACT";
        break;
      }
      case "RESET:NACT": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // Pause for a cycle, then resume execution by fetching the next opcode
        this.state = "FETCH_OPCODE:BAR";
        break;
      }

      case "FETCH_OPCODE:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "FETCH_OPCODE:NACT_0";
        break;
      }
      case "FETCH_OPCODE:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // Pause for a cycle
        this.state = "FETCH_OPCODE:DTB";
        break;
      }
      case "FETCH_OPCODE:DTB": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.opcode = this.bus.data;
        this.state = "FETCH_OPCODE:NACT_1";
        break;
      }
      case "FETCH_OPCODE:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // Pause for a cycle

        // Here, the CPU needs to determine which state to enter next based on
        // the fetched instruction and enter the next appropriate state in the
        // state machine.
        this._decodeInstruction();
        break;
      }

      case "INDIRECT_READ:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "INDIRECT_READ:NACT_0";
        break;
      }
      case "INDIRECT_READ:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_READ:DTB";
        break;
      }
      case "INDIRECT_READ:DTB": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.args[0] = this.bus.data;
        this.state = "INDIRECT_READ:NACT_1";
        break;
      }
      case "INDIRECT_READ:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;

        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this._executeInstruction();
        break;
      }

      case "JUMP:BAR_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "JUMP:NACT_0";
        break;
      }
      case "JUMP:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:DTB_0";
        break;
      }
      case "JUMP:DTB_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.args[0] = this.bus.data;
        this.state = "JUMP:NACT_1";
        break;
      }
      case "JUMP:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:BAR_1";
        break;
      }
      case "JUMP:BAR_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "JUMP:NACT_2";
        break;
      }
      case "JUMP:NACT_2": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:DTB_1";
        break;
      }
      case "JUMP:DTB_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.args[1] = this.bus.data;
        this.state = "JUMP:NACT_3";
        break;
      }
      case "JUMP:NACT_3": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:NACT_4";
        break;
      }
      case "JUMP:NACT_4": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:NACT_5";
        break;
      }
      case "JUMP:NACT_5": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:NACT_6";
        break;
      }
      case "JUMP:NACT_6": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "JUMP:NACT_7";
        break;
      }
      case "JUMP:NACT_7": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;

        // Finally, handle the jump

        // ```
        // Format - Decle #1    Format - Decle #2    Format - Decle #3
        // 0000:0000:0000:0100  0000:00rr:aaaa:aaff  0000:00aa:aaaa:aaaa
        //
        // where:
        //
        //     rr    indicates the register into which to store the return address
        //           such that:
        //               rr == 00    indicates to store return address in register R4
        //               rr == 01    indicates register R5
        //               rr == 10    indicates register R6
        //               rr == 11    indicates that the CP1610 should not store the
        //                           return address, signaling a Jump without return
        //
        //     ff    indicates how to affect the Interrupt (I) flag in the CP1610
        //           such that:
        //               ff == 00    indicates not to affect the Interrupt flag
        //               ff == 01    indicates to set the Interrupt flag
        //               ff == 10    indicates to clear the Interrupt flag
        //               ff == 11    unknown opcode (behavior unknown!!)
        //
        //     aaaaaaaaaaaaaaaa    indicates the address to where the CP1610 should Jump
        // ```

        // prettier-ignore
        {
          const rr                = (0b0000_0011_0000_0000 & this.args[0]) >> 8;
          const ff                = (0b0000_0000_0000_0011 & this.args[0]);
          const aaaaaaaaaaaaaaaa  = (0b0000_0000_1111_1100 & this.args[0]) << 8
                                  | (0b0000_0011_1111_1111 & this.args[1]);
          
          let regIndex = null;
          switch (rr) {
            case 0b00: {regIndex = 4; break;}
            case 0b01: {regIndex = 5; break;}
            case 0b10: {regIndex = 6; break;}
          }
          if (regIndex != null) {
            this.r[regIndex] = this.r[7];
          }
          if (ff === 0b01) this.i = true;
          if (ff === 0b10) this.i = false;
          this.r[7] = aaaaaaaaaaaaaaaa;
        }

        this.state = "FETCH_OPCODE:BAR";
        break;
      }

      case "BRANCH_READ_OFFSET:BAR_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "BRANCH_READ_OFFSET:NACT_0";
        break;
      }
      case "BRANCH_READ_OFFSET:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "BRANCH_READ_OFFSET:DTB_0";
        break;
      }
      case "BRANCH_READ_OFFSET:DTB_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.args[0] = this.bus.data;
        this.state = "BRANCH_READ_OFFSET:NACT_1";
        break;
      }
      case "BRANCH_READ_OFFSET:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "BRANCH_READ_OFFSET:NACT_2";
        break;
      }
      case "BRANCH_READ_OFFSET:NACT_2": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "BRANCH_READ_OFFSET:NACT_3";
        break;
      }
      case "BRANCH_READ_OFFSET:NACT_3": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "BRANCH_READ_OFFSET:NACT_4";
        break;
      }
      case "BRANCH_READ_OFFSET:NACT_4": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.args[1] = this.bus.data;
        let condition = false;
        switch (0b0000_0000_0000_0111 & this.opcode) {
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
          this.state = "BRANCH_JUMP:NACT_0";
        } else {
          this.state = "FETCH_OPCODE:BAR";
        }
        break;
      }

      case "BRANCH_JUMP:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        this.state = "BRANCH_JUMP:NACT_1";
        break;
      }
      case "BRANCH_JUMP:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        const direction = 0b0000_0000_0010_0000 & this.opcode ? -1 : 1;
        this.r[7] += direction * (this.args[0] + 1);
        this.state = "FETCH_OPCODE:BAR";
        break;
      }

      case "INDIRECT_WRITE:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Data to write. Devices should latch the
        // address at this time and perform address decoding.
        this.bus.data = this.r[this.f1] || 0;
        this.state = "INDIRECT_WRITE:NACT_0";
        break;
      }
      case "INDIRECT_WRITE:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_WRITE:DW";
        break;
      }
      case "INDIRECT_WRITE:DW": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DW;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU asserts the data to be written. The addressed device can
        // latch the data at this time, although it is not necessary yet, as the
        // data is stable through the next phase.
        this.bus.data = this.r[this.f2];
        this.state = "INDIRECT_WRITE:DWS";
        break;
      }
      case "INDIRECT_WRITE:DWS": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DWS;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU continues to assert the data to be written. The addressed
        // device can latch the data at this time if it hasn't already.
        this.bus.data = this.r[this.f2];
        this.state = "INDIRECT_WRITE:NACT_1";
        break;
      }
      case "INDIRECT_WRITE:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.

        // If the address register specified is R4-R7 (the auto-incrementing
        // registers), then the value in the address register will be
        // incremented by one after the value in the source register has been
        // stored at the designated address.
        if (this.f1 >= 4) {
          this.r[this.f1] += 1;
        }
        this._executeInstruction();
        break;
      }

      case "DIRECT_READ:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "DIRECT_READ:NACT_0";
        break;
      }
      case "DIRECT_READ:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ:ADAR";
        break;
      }
      case "DIRECT_READ:ADAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.ADAR;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for a subsequent DTB bus phase. The CPU remains off the bus
        // during this cycle.
        this.state = "DIRECT_READ:NACT_1";
        break;
      }
      case "DIRECT_READ:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ:DTB";
        break;
      }
      case "DIRECT_READ:DTB": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The newly-addressed device (the one whose address was given during
        // ADAR) asserts its data on the bus. The CPU then reads this data.
        this.state = "DIRECT_READ:NACT_2";
        break;
      }
      case "DIRECT_READ:NACT_2": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      case "DIRECT_WRITE:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Data to write. Devices should latch the
        // address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.r[7] += 1;
        this.state = "DIRECT_WRITE:NACT_0";
        break;
      }
      case "DIRECT_WRITE:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_WRITE:ADAR";
        break;
      }
      case "DIRECT_WRITE:ADAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.ADAR;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for subsequent DW and DWS bus phase. The CPU remains off the
        // bus during this cycle.
        this.state = "DIRECT_WRITE:NACT_1";
        break;
      }
      case "DIRECT_WRITE:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_WRITE:DW";
        break;
      }
      case "DIRECT_WRITE:DW": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DW;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU asserts the data to be written. The newly-addressed device
        // (the one whose address was given during ADAR) can latch the data at
        // this time, although it is not necessary yet, as the data is stable
        // through the next phase.
        this.state = "DIRECT_WRITE:DWS";
        break;
      }
      case "DIRECT_WRITE:DWS": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DWS;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU continues to assert the data to be written. The addressed
        // device can latch the data at this time if it hasn't already.
        this.state = "DIRECT_WRITE:NACT_2";
        break;
      }
      case "DIRECT_WRITE:NACT_2": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      case "INDIRECT_SDBD_READ:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.r[7] += 1;
        this.state = "INDIRECT_SDBD_READ:NACT_0";
        break;
      }
      case "INDIRECT_SDBD_READ:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_SDBD_READ:DTB";
        break;
      }
      case "INDIRECT_SDBD_READ:DTB": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for a subsequent DTB bus phase. The CPU remains off the bus
        // during this cycle.
        this.state = "INDIRECT_SDBD_READ:BAR";
        break;
      }
      case "INDIRECT_SDBD_READ:BAR": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.BAR;
          return;
        }
        if (this.ticks !== 3) return;
        // The device deasserts the bus during the first quarter of this cycle,
        // and the CPU asserts a new address for the upper byte of Data during
        // the latter half of this cycle. Notice that there is no NACT spacing
        // cycle before this BAR!
        this.state = "INDIRECT_SDBD_READ:NACT_1";
        break;
      }
      case "INDIRECT_SDBD_READ:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_SDBD_READ:DTB";
        break;
      }
      case "INDIRECT_SDBD_READ:DTB": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DTB;
          return;
        }
        if (this.ticks !== 3) return;
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data. As with cycle 3, there is no NACT spacing cycle after this
        // cycle!

        this._executeInstruction();
        break;
      }

      case "INTERRUPT:INTAK": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.INTAK;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU asserts the current Stack Pointer address (the value in R6),
        // and increments the stack pointer internally. Devices are expected to
        // latch this address and decode it internally. Also, devices are
        // expected to take any special interrupt-acknowledgement steps at this
        // time. (On the Intellivision, this bus phase is remapped to BAR for
        // most devices. The only device that sees INTAK is the 16-bit System
        // RAM.)
        this.state = "INTERRUPT:NACT_0";
        break;
      }
      case "INTERRUPT:NACT_0": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INTERRUPT:DW";
        break;
      }
      case "INTERRUPT:DW": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DW;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU outputs the current program counter address. The device
        // addressed during INTAK should latch the data either now or during the
        // next cycle (DWS).
        this.state = "INTERRUPT:DWS";
        break;
      }
      case "INTERRUPT:DWS": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.DWS;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU continues to assert the current program counter address. If
        // the addressed device hasn't done so already, it should latch the data
        // now.
        this.state = "INTERRUPT:NACT_1";
        break;
      }
      case "INTERRUPT:NACT_1": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INTERRUPT:IAB";
        break;
      }
      case "INTERRUPT:IAB": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.IAB;
          return;
        }
        if (this.ticks !== 3) return;
        // An external device asserts the new program counter address (the
        // address of the interrupt service routine) on the bus. The CPU latches
        // this address and transfers it to the program counter. On the
        // Intellivision, one of the EXEC ROMs handles the program counter
        // address assertion.
        this.state = "INTERRUPT:NACT_2";
        break;
      }
      case "INTERRUPT:NACT_2": {
        if (this.ticks === 0) {
          this.bus.flags = Bus.___;
          return;
        }
        if (this.ticks !== 3) return;
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      default: {
        throw new UnreachableCaseError(this.state);
      }
    }
  }

  /**
   * Decoded from the current opcode.
   *
   * Register index in opcodes with this form:
   *
   * ```txt
   * 0000:0000:00rr:r000
   * ```
   */
  f1: RegisterIndex = 0;
  /**
   * Decoded from the current opcode.
   *
   * Register index in opcodes with this form:
   *
   * ```txt
   * 0000:0000:0000:0rrr
   * ```
   */
  f2: RegisterIndex = 0;

  effectiveAddress: number = 0xffff;

  _decodeInstruction() {
    this.instruction = decodeOpcode(this.opcode);

    this.f1 = ((0b0000_0000_0011_1000 & this.opcode) >> 3) as RegisterIndex;
    this.f2 = (0b0000_0000_0000_0111 & this.opcode) as RegisterIndex;
    const isExternalReferenceInstruction = 0b0000_0001_0000_0000 & this.opcode;

    if (!this.instruction) {
      trace(
        `Uknown instruction opcode: $${this.opcode
          .toString(16)
          .padStart(4, "0")}`,
      );
      this.state = "FETCH_OPCODE:BAR";
      return;
    }
    this.state = INSTRUCTION_STATES[this.instruction.mnemonic];

    // If the double-byte flag is set, and we're making an indirect read next,
    // we want to actually enter the special SDBD mode for indirect reads:
    if (this.state === "INDIRECT_READ:BAR" && this.d) {
      this.state = "INDIRECT_SDBD_READ:BAR";
    }
  }

  _executeInstruction() {
    if (!this.instruction) {
      throw new Error("No decoded instruction to execute");
    }

    this.prevInstruction = this.instruction;

    switch (this.instruction.mnemonic) {
      case "HLT": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SDBD": {
        this.d = true;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "EIS": {
        this.i = true;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "DIS": {
        this.i = false;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "J": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "TCI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "CLRC": {
        this.c = false;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "SETC": {
        this.c = true;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "INCR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = this.r[i] + 1;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "DECR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = this.r[i] - 1;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "COMR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = this.r[i] ^ 0xffff;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "NEGR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = (this.r[i] ^ 0xffff) + 1;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        // TODO: set the overflow flag TODO: set the carry flag
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "ADCR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "GSWD": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "NOP": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SIN": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "RSWD": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SWAP": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SLL": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "RLC": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SLLC": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SLR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SAR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "RRC": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SARC": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MOVR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "ADDR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SUBR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "CMPR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "ANDR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "XORR": {
        const result = this.r[this.f2] ^ this.r[this.f1];
        this.z = result === 0;
        this.s = (result & 0b1000_0000_0000_0000) !== 0;
        this.r[this.f2] = result;
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "B": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVO": {
        // HACKish - I feel like I'm misunderstanding something about the
        // internal mechanics of the CPU here.
        if (this.state === "DIRECT_WRITE:NACT_2") {
          this.state = "FETCH_OPCODE:BAR";
        } else {
          this.state = "DIRECT_WRITE:BAR";
        }
        break;
      }
      case "MVO@":
      case "MVOI": {
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "MVI@":
      case "MVI":
      case "MVII": {
        this.r[this.f2] = this.args[0];
        this.state = "FETCH_OPCODE:BAR";
        return;
      }
      case "ADD": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "ADD@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "ADDI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SUB": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SUB@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SUBI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "CMP": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "CMP@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "CMPI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "AND": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "AND@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "ANDI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "XOR": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "XOR@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "XORI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      default: {
        throw new UnreachableCaseError(this.instruction.mnemonic);
      }
    }
  }
}

const decodeRegisterIndex = (opcode: number): RegisterIndex => {
  return (opcode & 0b0000_0000_0000_0111) as any;
};

export const forTestSuite = {
  decodeOpcode,
};
