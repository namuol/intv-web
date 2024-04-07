export interface BusDevice {
  clock(): void;
  debug_read(addr: number): null | number;
}

export type BusFlags =
  | 0b000
  | 0b001
  | 0b010
  | 0b011
  | 0b100
  | 0b101
  | 0b110
  | 0b111;

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

export class Bus {
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
  static ___ = 0 as const;
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
  static ADAR = 1 as const;
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
  static IAB = 2 as const;
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
  static DTB = 3 as const;
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
  static BAR = 4 as const;
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
  static DW = 5 as const;
  /**
   * DWS - Data Write Strobe
   *
   * - BDIR: 1
   * - BC2: 1
   * - BC1: 0
   *
   * Behaves the same as DW
   */
  static DWS = 6 as const;
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
  static INTAK = 7 as const;
  ticks: number = 0;

  toString(): string {
    return `Bus(${BUS_FLAG_STRINGS[this.flags]}:$${this._data
      .toString(16)
      .padStart(4, "0")})`;
  }

  _data: number = 0;

  /**
   * Current 16-bit data on the bus
   */
  get data(): number {
    return this._data & 65535;
  }
  set data(_data: number) {
    // trace(`bus.data = $${_data.toString(16)}`);
    this._data = _data & 65535;
  }

  //
  // BUS CONTROL FLAGS
  //
  flags: BusFlags = Bus.___;

  clock() {
    this.ticks = (this.ticks + 1) % 4;
    // Bus reads 0xFFFF when there's nothing asserting data; this is mainly to
    // match jzIntv behavior:
    if (this.ticks === 3 && this.flags === Bus.___) {
      this._data = 65535;
    }
  }
}
