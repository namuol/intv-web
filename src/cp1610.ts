import {UnreachableCaseError} from "./UnreachableCaseError";
import instructions from "./instructions";

export type InstructionConfig = Readonly<{
  instruction: string;
  mnemonic: Mnemonic;
  cycles: ReadonlyArray<number>;
  interruptible: boolean;
  in_s?: boolean;
  in_z?: boolean;
  in_o?: boolean;
  in_c?: boolean;
  in_d?: boolean;
  out_s?: boolean;
  out_z?: boolean;
  out_o?: boolean;
  out_c?: boolean;
  out_i?: boolean;
  out_d?: boolean;
}>;

export type Mnemonic =
  | "HLT"
  | "SDBD"
  | "EIS"
  | "DIS"
  | "J"
  | "TCI"
  | "CLRC"
  | "SETC"
  | "INCR"
  | "DECR"
  | "COMR"
  | "NEGR"
  | "ADCR"
  | "GSWD"
  | "NOP"
  | "SIN"
  | "RSWD"
  | "SWAP"
  | "SLL"
  | "RLC"
  | "SLLC"
  | "SLR"
  | "SAR"
  | "RRC"
  | "SARC"
  | "MOVR"
  | "ADDR"
  | "SUBR"
  | "CMPR"
  | "ANDR"
  | "XORR"
  | "B"
  | "MVO"
  | "MVO@"
  | "MVOI"
  | "MVI"
  | "MVI@"
  | "MVII"
  | "ADD"
  | "ADD@"
  | "ADDI"
  | "SUB"
  | "SUB@"
  | "SUBI"
  | "CMP"
  | "CMP@"
  | "CMPI"
  | "AND"
  | "AND@"
  | "ANDI"
  | "XOR"
  | "XOR@"
  | "XORI";

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
  | "DIRECT_READ:BAR"
  | "DIRECT_READ:NACT_0"
  | "DIRECT_READ:ADAR"
  | "DIRECT_READ:NACT_1"
  | "DIRECT_READ:DTB"
  | "DIRECT_READ:NACT_2"
  // Same as above, but read two args (only used for Jump instructions)
  //
  // I'm not sure this is the exact sequence, but I'm going to assume it is for
  // now since it does match the cycle count for all Jump instructions (12)
  | "DIRECT_READ_TWICE:BAR_0"
  | "DIRECT_READ_TWICE:NACT_0"
  | "DIRECT_READ_TWICE:ADAR_0"
  | "DIRECT_READ_TWICE:NACT_1"
  | "DIRECT_READ_TWICE:DTB_0"
  | "DIRECT_READ_TWICE:NACT_2"
  | "DIRECT_READ_TWICE:BAR_1"
  | "DIRECT_READ_TWICE:NACT_1"
  | "DIRECT_READ_TWICE:ADAR_1"
  | "DIRECT_READ_TWICE:NACT_1"
  | "DIRECT_READ_TWICE:DTB_1"
  | "DIRECT_READ_TWICE:NACT_2"
  //
  | "DIRECT_WRITE:BAR"
  | "DIRECT_WRITE:NACT_0"
  | "DIRECT_WRITE:ADAR"
  | "DIRECT_WRITE:NACT_1"
  | "DIRECT_WRITE:DW"
  | "DIRECT_WRITE:DWS"
  | "DIRECT_WRITE:NACT_2"
  //
  | "INDIRECT_SDBD_READ:BAR"
  | "INDIRECT_SDBD_READ:NACT_0"
  | "INDIRECT_SDBD_READ:DTB"
  | "INDIRECT_SDBD_READ:BAR"
  | "INDIRECT_SDBD_READ:NACT_1"
  | "INDIRECT_SDBD_READ:DTB"
  //
  | "INTERRUPT:INTAK"
  | "INTERRUPT:NACT_0"
  | "INTERRUPT:DW"
  | "INTERRUPT:DWS"
  | "INTERRUPT:NACT_1"
  | "INTERRUPT:IAB"
  | "INTERRUPT:NACT_2";

const INSTRUCTION_STATES: Record<Mnemonic, CpuState> = {
  HLT: "INDIRECT_READ:BAR",
  SDBD: "INDIRECT_READ:BAR",
  EIS: "INDIRECT_READ:BAR",
  DIS: "INDIRECT_READ:BAR",
  J: "DIRECT_READ_TWICE:BAR_0",
  TCI: "INDIRECT_READ:BAR",
  CLRC: "INDIRECT_READ:BAR",
  SETC: "INDIRECT_READ:BAR",
  INCR: "INDIRECT_READ:BAR",
  DECR: "INDIRECT_READ:BAR",
  COMR: "INDIRECT_READ:BAR",
  NEGR: "INDIRECT_READ:BAR",
  ADCR: "INDIRECT_READ:BAR",
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
  ADDR: "INDIRECT_READ:BAR",
  SUBR: "INDIRECT_READ:BAR",
  CMPR: "INDIRECT_READ:BAR",
  ANDR: "INDIRECT_READ:BAR",
  XORR: "INDIRECT_READ:BAR",
  B: "INDIRECT_READ:BAR",
  MVO: "INDIRECT_READ:BAR",
  "MVO@": "INDIRECT_READ:BAR",
  MVOI: "INDIRECT_READ:BAR",
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

export class Bus {
  _data: number = 0x0000;

  /**
   * Current 16-bit data on the bus
   */
  get data(): number {
    return this._data & 0xffff;
  }
  set data(_data: number) {
    this._data = _data & 0xffff;
  }

  //
  // BUS CONTROL FLAGS
  //
  bdir: boolean = false;
  bc2: boolean = false;
  bc1: boolean = false;

  /**
   * NACT - No ACTion
   *
   * - BDIR: 0
   * - BC2: 0
   * - BC1: 0
   *
   * During this stage, no device is active on the bus. DB0 through DB15 are
   * allowed to float, with their previous driven value fading away during this
   * phase.
   */
  nact() {
    this.bdir = false;
    this.bc2 = false;
    this.bc1 = false;
  }

  /**
   * ADAR - Address Data to Address Register
   *
   * - BDIR: 0
   * - BC2: 0
   * - BC1: 1
   *
   * This bus phase is issued by the CPU during a Direct Addressing Mode
   * instruction. Prior to this phase, an address will have been latched in a
   * device by a prior BAR or ADAR bus phase. Then, during this phase, the
   * currently selected device responds with its data on the bus, and at the end
   * of this phase, all devices should latch this address as the address for the
   * next memory access (DTB, DW, or DWS phases). The CPU asserts nothing during
   * this phase -- rather, it expects the currently addressed device to inform
   * the rest of the machine of the address for the next access.
   */
  adar() {
    this.bdir = false;
    this.bc2 = false;
    this.bc1 = true;
  }

  /**
   * IAB - Interrupt Address to Bus
   *
   * - BDIR: 0
   * - BC2: 1
   * - BC1: 0
   *
   * This bus phase is entered during interrupt processing, after the current
   * program counter has been written to the stack. It's also entered into on
   * the first cycle after coming out of RESET. During this phase, an external
   * device should assert the address of the Interrupt or RESET vector as
   * appropriate. The CPU then moves this address into the program counter and
   * resumes execution.
   */
  iab() {
    this.bdir = false;
    this.bc2 = true;
    this.bc1 = false;
  }

  /**
   * DTB - Data To Bus
   *
   * - BDIR: 0
   * - BC2: 1
   * - BC1: 1
   *
   * This phase is entered during a read cycle. During this phase, the currently
   * addressed device should assert its data on the bus. The CPU then reads this
   * data.
   */
  dtb() {
    this.bdir = false;
    this.bc2 = true;
    this.bc1 = true;
  }

  /**
   * BAR - Bus to Address Register
   *
   * - BDIR: 1
   * - BC2: 0
   * - BC1: 0
   *
   * During this phase, the CPU asserts the address for the current memory
   * access. All devices on the bus are expected to latch this address and
   * perform address decoding at this time.
   */
  bar() {
    this.bdir = true;
    this.bc2 = false;
    this.bc1 = false;
  }

  /**
   * DW - Data Write
   *
   * - BDIR: 1
   * - BC2: 0
   * - BC1: 1
   *
   * The DW and DWS bus phases initiate a write cycle. They always occur
   * tofETCHher on adjacent cycles, with data remaining stable on the bus across
   * the transition from DW to DWS. During these phases, the data being written
   * is available for external memories to latch. The CP-1600 allows two full
   * CPU cycles for external RAM to latch the data.
   */
  dw() {
    this.bdir = true;
    this.bc2 = false;
    this.bc1 = true;
  }

  /**
   * DWS - Data Write Strobe
   *
   * - BDIR: 1
   * - BC2: 1
   * - BC1: 0
   *
   * Behaves the same as DW
   */
  dws() {
    this.bdir = true;
    this.bc2 = true;
    this.bc1 = false;
  }

  /**
   * INTAK - INTerrupt AcKnowledge
   *
   * - BDIR: 1
   * - BC2: 1
   * - BC1: 1
   *
   * The CPU enters this bus phase on the first cycle of interrupt processing.
   * During the phase, the CPU places the current stack pointer value on the bus
   * as it prepares to "push" the current program counter on the stack. Devices
   * are expected to treat INTAK similarly to a BAR bus phase. Indeed, on the
   * Intellivision Master Component, only the 16-bit System RAM sees the INTAK
   * bus phase. It uses this bus phase to trigger a special bus-copy mode as
   * well as for latching the current address. For all other devices in the
   * system, INTAK is remapped to BAR by some discrete logic, and so is
   * processed as a normal addressing cycle elsewhere.
   */
  intak() {
    this.bdir = true;
    this.bc2 = true;
    this.bc1 = true;
  }
}

/**
 * Emulation of the General Instruments CP1610 microprocessor, as used in the
 * Intellivision and Intellvision II home video game consoles.
 */
export class CP1610 {
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

  constructor(bus: Bus) {
    this.bus = bus;
    this._reset();
  }

  _reset() {
    this.state = "RESET:IAB";
  }

  state: CpuState = "RESET:IAB";

  cycle() {
    switch (this.state) {
      case "RESET:IAB": {
        this.bus.iab();
        // Entered into on the first cycle after coming out of RESET. During
        // this phase, an external device should assert the address of the RESET
        // vector as appropriate. The CPU then moves this address into the
        // program counter and resumes execution.
        this.r[7] = this.bus.data;
        this.state = "RESET:NACT";
        break;
      }
      case "RESET:NACT": {
        this.bus.nact();
        // Pause for a cycle, then resume execution by fetching the next opcode
        this.state = "FETCH_OPCODE:BAR";
        break;
      }

      case "FETCH_OPCODE:BAR": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.bus.data = this.r[7];
        this.state = "FETCH_OPCODE:NACT_0";
        break;
      }
      case "FETCH_OPCODE:NACT_0": {
        this.bus.nact();
        // Pause for a cycle
        this.state = "FETCH_OPCODE:DTB";
        break;
      }
      case "FETCH_OPCODE:DTB": {
        this.bus.dtb();
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.opcode = this.bus.data;
        this.state = "FETCH_OPCODE:NACT_1";
        break;
      }
      case "FETCH_OPCODE:NACT_1": {
        this.bus.nact();
        // Pause for a cycle

        // Here, the CPU needs to determine which state to enter next based on
        // the fetched instruction.
        this._decodeInstruction();
        break;
      }

      case "INDIRECT_READ:BAR": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.state = "INDIRECT_READ:NACT_0";
        break;
      }
      case "INDIRECT_READ:NACT_0": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_READ:DTB";
        break;
      }
      case "INDIRECT_READ:DTB": {
        this.bus.dtb();
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data.
        this.state = "INDIRECT_READ:NACT_1";
        break;
      }
      case "INDIRECT_READ:NACT_1": {
        this.bus.nact();

        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      case "INDIRECT_WRITE:BAR": {
        this.bus.bar();
        this.state = "INDIRECT_WRITE:NACT_0";
        break;
      }
      case "INDIRECT_WRITE:NACT_0": {
        this.bus.nact();
        this.state = "INDIRECT_WRITE:DW";
        break;
      }
      case "INDIRECT_WRITE:DW": {
        this.bus.dw();
        this.state = "INDIRECT_WRITE:DWS";
        break;
      }
      case "INDIRECT_WRITE:DWS": {
        this.bus.dws();
        this.state = "INDIRECT_WRITE:NACT_1";
        break;
      }
      case "INDIRECT_WRITE:NACT_1": {
        this.bus.nact();
        this._executeInstruction();
        break;
      }

      case "DIRECT_READ:BAR": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.state = "DIRECT_READ:NACT_0";
        break;
      }
      case "DIRECT_READ:NACT_0": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ:ADAR";
        break;
      }
      case "DIRECT_READ:ADAR": {
        this.bus.adar();
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for a subsequent DTB bus phase. The CPU remains off the bus
        // during this cycle.
        this.state = "DIRECT_READ:NACT_1";
        break;
      }
      case "DIRECT_READ:NACT_1": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ:DTB";
        break;
      }
      case "DIRECT_READ:DTB": {
        this.bus.dtb();
        // The newly-addressed device (the one whose address was given during
        // ADAR) asserts its data on the bus. The CPU then reads this data.
        this.state = "DIRECT_READ:NACT_2";
        break;
      }
      case "DIRECT_READ:NACT_2": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      case "DIRECT_READ_TWICE:BAR_0": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.state = "DIRECT_READ_TWICE:NACT_0";
        break;
      }
      case "DIRECT_READ_TWICE:NACT_0": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ_TWICE:ADAR_0";
        break;
      }
      case "DIRECT_READ_TWICE:ADAR_0": {
        this.bus.adar();
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for a subsequent DTB bus phase. The CPU remains off the bus
        // during this cycle.
        this.state = "DIRECT_READ_TWICE:NACT_1";
        break;
      }
      case "DIRECT_READ_TWICE:NACT_1": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ_TWICE:DTB_0";
        break;
      }
      case "DIRECT_READ_TWICE:DTB_0": {
        this.bus.dtb();
        // The newly-addressed device (the one whose address was given during
        // ADAR) asserts its data on the bus. The CPU then reads this data.
        this.state = "DIRECT_READ_TWICE:NACT_2";
        break;
      }
      case "DIRECT_READ_TWICE:NACT_2": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ_TWICE:BAR_1";
        break;
      }
      case "DIRECT_READ_TWICE:BAR_1": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.state = "DIRECT_READ_TWICE:NACT_1";
        break;
      }
      case "DIRECT_READ_TWICE:NACT_1": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ_TWICE:ADAR_1";
        break;
      }
      case "DIRECT_READ_TWICE:ADAR_1": {
        this.bus.adar();
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for a subsequent DTB bus phase. The CPU remains off the bus
        // during this cycle.
        this.state = "DIRECT_READ_TWICE:NACT_1";
        break;
      }
      case "DIRECT_READ_TWICE:NACT_1": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_READ_TWICE:DTB_1";
        break;
      }
      case "DIRECT_READ_TWICE:DTB_1": {
        this.bus.dtb();
        // The newly-addressed device (the one whose address was given during
        // ADAR) asserts its data on the bus. The CPU then reads this data.
        this.state = "DIRECT_READ_TWICE:NACT_2";
        break;
      }
      case "DIRECT_READ_TWICE:NACT_2": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      case "DIRECT_WRITE:BAR": {
        this.bus.bar();
        // CPU asserts address of the Data to write. Devices should latch the
        // address at this time and perform address decoding.
        this.state = "DIRECT_WRITE:NACT_0";
        break;
      }
      case "DIRECT_WRITE:NACT_0": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_WRITE:ADAR";
        break;
      }
      case "DIRECT_WRITE:ADAR": {
        this.bus.adar();
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for subsequent DW and DWS bus phase. The CPU remains off the
        // bus during this cycle.
        this.state = "DIRECT_WRITE:NACT_1";
        break;
      }
      case "DIRECT_WRITE:NACT_1": {
        this.bus.nact();
        // The device deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "DIRECT_WRITE:DW";
        break;
      }
      case "DIRECT_WRITE:DW": {
        this.bus.dw();
        // The CPU asserts the data to be written. The newly-addressed device
        // (the one whose address was given during ADAR) can latch the data at
        // this time, although it is not necessary yet, as the data is stable
        // through the next phase.
        this.state = "DIRECT_WRITE:DWS";
        break;
      }
      case "DIRECT_WRITE:DWS": {
        this.bus.dws();
        // The CPU continues to assert the data to be written. The addressed
        // device can latch the data at this time if it hasn't already.
        this.state = "DIRECT_WRITE:NACT_2";
        break;
      }
      case "DIRECT_WRITE:NACT_2": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.

        this._executeInstruction();
        break;
      }

      case "INDIRECT_SDBD_READ:BAR": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.state = "INDIRECT_SDBD_READ:NACT_0";
        break;
      }
      case "INDIRECT_SDBD_READ:NACT_0": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_SDBD_READ:DTB";
        break;
      }
      case "INDIRECT_SDBD_READ:DTB": {
        this.bus.dtb();
        // The addressed device asserts the data that is at the location
        // addressed during BAR. This data is then latched as an address by all
        // devices for a subsequent DTB bus phase. The CPU remains off the bus
        // during this cycle.
        this.state = "INDIRECT_SDBD_READ:BAR";
        break;
      }
      case "INDIRECT_SDBD_READ:BAR": {
        this.bus.bar();
        // The device deasserts the bus during the first quarter of this cycle,
        // and the CPU asserts a new address for the upper byte of Data during
        // the latter half of this cycle. Notice that there is no NACT spacing
        // cycle before this BAR!
        this.state = "INDIRECT_SDBD_READ:NACT_1";
        break;
      }
      case "INDIRECT_SDBD_READ:NACT_1": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INDIRECT_SDBD_READ:DTB";
        break;
      }
      case "INDIRECT_SDBD_READ:DTB": {
        this.bus.dtb();
        // The addressed device asserts its data on the bus. The CPU then reads
        // this data. As with cycle 3, there is no NACT spacing cycle after this
        // cycle!

        this._executeInstruction();
        break;
      }

      case "INTERRUPT:INTAK": {
        this.bus.intak();
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
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INTERRUPT:DW";
        break;
      }
      case "INTERRUPT:DW": {
        this.bus.dw();
        // The CPU outputs the current program counter address. The device
        // addressed during INTAK should latch the data either now or during the
        // next cycle (DWS).
        this.state = "INTERRUPT:DWS";
        break;
      }
      case "INTERRUPT:DWS": {
        this.bus.dws();
        // The CPU continues to assert the current program counter address. If
        // the addressed device hasn't done so already, it should latch the data
        // now.
        this.state = "INTERRUPT:NACT_1";
        break;
      }
      case "INTERRUPT:NACT_1": {
        this.bus.nact();
        // The CPU deasserts the bus, and no other bus activity occurs during
        // this cycle.
        this.state = "INTERRUPT:IAB";
        break;
      }
      case "INTERRUPT:IAB": {
        this.bus.iab();
        // An external device asserts the new program counter address (the
        // address of the interrupt service routine) on the bus. The CPU latches
        // this address and transfers it to the program counter. On the
        // Intellivision, one of the EXEC ROMs handles the program counter
        // address assertion.
        this.state = "INTERRUPT:NACT_2";
        break;
      }
      case "INTERRUPT:NACT_2": {
        this.bus.nact();
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

  _decodeInstruction() {
    this.instruction = decodeOpcode(this.opcode);
    if (!this.instruction) {
      console.error(
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

    switch (this.instruction.mnemonic) {
      case "HLT": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "SDBD": {
        this.d = true;
        return;
      }
      case "EIS": {
        this.i = true;
        return;
      }
      case "DIS": {
        this.i = false;
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
        return;
      }
      case "SETC": {
        this.c = true;
        return;
      }
      case "INCR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = this.r[i] + 1;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        return;
      }
      case "DECR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = this.r[i] - 1;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        return;
      }
      case "COMR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = this.r[i] ^ 0xffff;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        return;
      }
      case "NEGR": {
        const i = decodeRegisterIndex(this.opcode);
        this.r[i] = (this.r[i] ^ 0xffff) + 1;
        this.s = (this.r[i] & 0b1000_0000_0000_0000) !== 0;
        this.z = this.r[i] === 0;
        // TODO: set the overflow flag
        // TODO: set the carry flag
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
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "B": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVO": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVO@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVOI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVI": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVI@": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
      }
      case "MVII": {
        throw new Error(`${this.instruction.mnemonic} not implemented`);
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

  step() {
    while (this.state !== "FETCH_OPCODE:BAR") {
      this.cycle();
    }
  }
}

const opcodeLookup: InstructionConfig[] = [];
for (const [rangeKey, instructionConfig] of Object.entries(instructions)) {
  const [start, end = start] = rangeKey
    .split("-")
    .map((str) => parseInt(str, 16)) as [number, number | undefined];
  for (let i = start; i <= end; ++i) {
    opcodeLookup[i] = instructionConfig;
  }
}

const decodeOpcode = (opcode: number): InstructionConfig | null => {
  return opcodeLookup[opcode] ?? null;
};

const decodeRegisterIndex = (opcode: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 => {
  return (opcode & 0b0000_0000_0000_0111) as any;
};

export const forTestSuite = {
  decodeOpcode,
};
