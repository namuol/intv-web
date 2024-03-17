import {UnreachableCaseError} from "./UnreachableCaseError";

class Bus {
  _data: number = 0x0000;

  /**
   * Current 16-bit data on the bus
   */
  get data(): number {
    return this.data & 0xffff;
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
  _registers: Uint16Array = new Uint16Array(8);

  /**
   * General Purpose.
   */
  get r0() {
    return this._registers[0];
  }
  set r0(val: number) {
    this._registers[0] = val;
  }

  /**
   * General Purpose.
   */
  get r1() {
    return this._registers[1];
  }
  set r1(val: number) {
    this._registers[1] = val;
  }

  /**
   * General Purpose.
   */
  get r2() {
    return this._registers[2];
  }
  set r2(val: number) {
    this._registers[2] = val;
  }

  /**
   * General Purpose.
   */
  get r3() {
    return this._registers[3];
  }
  set r3(val: number) {
    this._registers[3] = val;
  }

  /**
   * General Purpose. Auto-increments on indirect reads and writes.
   */
  get r4() {
    return this._registers[4];
  }
  set r4(val: number) {
    this._registers[4] = val;
  }

  /**
   * General Purpose. Auto-increments on indirect reads and writes.
   */
  get r5() {
    return this._registers[5];
  }
  set r5(val: number) {
    this._registers[5] = val;
  }

  /**
   * Stack Pointer. Auto-increments on indirect reads. Auto-decrements on
   * indirect writes.
   */
  get r6() {
    return this._registers[6];
  }
  set r6(val: number) {
    this._registers[6] = val;
  }

  /**
   * Program Counter. Auto-increments on indirect reads and writes.
   */
  get r7() {
    return this._registers[7];
  }
  set r7(val: number) {
    this._registers[7] = val;
  }

  get sp() {
    return this.r6;
  }
  set sp(addr: number) {
    this.r6 = addr;
  }

  get pc() {
    return this.r7;
  }
  set pc(addr: number) {
    this.r7 = addr;
  }

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
   * Current opcode we're executing.
   */
  opcode: number = 0x0000;

  constructor(bus: Bus) {
    this.bus = bus;
    this._reset();
  }

  _reset() {
    this.pc = 0x1000;
  }

  state:
    | "RESET:IAB"
    | "RESET:NACT"
    //
    | "FETCH_OPCODE:BAR"
    | "FETCH_OPCODE:NACT_0"
    | "FETCH_OPCODE:DTB"
    | "FETCH_OPCODE:NACT_1"
    //
    | "IND_IMM_READ:BAR"
    | "IND_IMM_READ:NACT_0"
    | "IND_IMM_READ:DTB"
    | "IND_IMM_READ:NACT_1" = "RESET:IAB";

  cycle() {
    switch (this.state) {
      case "RESET:IAB": {
        this.bus.iab();
        // Entered into on the first cycle after coming out of RESET. During
        // this phase, an external device should assert the address of the RESET
        // vector as appropriate. The CPU then moves this address into the
        // program counter and resumes execution.
        this.pc = this.bus.data;
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
        this.bus.data = this.pc;
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
        this.state = "FETCH_OPCODE:NACT_1";
        this.opcode = this.bus.data;
        break;
      }
      case "FETCH_OPCODE:NACT_1": {
        this.bus.nact();
        // Pause for a cycle

        // Here, the CPU needs to determine which state to enter next based on
        // the fetched instruction.
        break;
      }

      case "IND_IMM_READ:BAR": {
        this.bus.bar();
        // CPU asserts address of the Instruction or Data to read. Devices
        // should latch the address at this time and perform address decoding.
        this.state = "IND_IMM_READ:NACT_0";
        break;
      }
      case "IND_IMM_READ:NACT_0": {
        this.bus.nact();
        this.state = "IND_IMM_READ:DTB";
        break;
      }
      case "IND_IMM_READ:DTB": {
        this.bus.dtb();
        this.state = "IND_IMM_READ:NACT_1";
        break;
      }
      case "IND_IMM_READ:NACT_1": {
        this.bus.nact();
        // this.state
        break;
      }

      default: {
        throw new UnreachableCaseError(this.state);
      }
    }
  }
}
