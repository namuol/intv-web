import {Bus, BusDevice} from "./Bus";
import {UnreachableCaseError} from "./UnreachableCaseError";
import {trace} from "./trace";

export class RAM implements BusDevice {
  data: Uint16Array;
  start: number;
  _addr: number | null = null;
  bus: Bus;
  ticks: number = 0;
  name: string = "RAM";

  constructor(bus: Bus, start: number, end: number) {
    this.bus = bus;
    this.start = start;
    this.data = new Uint16Array(end - start);
  }

  debug_read(addrIn: number): number | null {
    const addr = addrIn - this.start;
    const data = this.data[addr];
    if (data == null) return null;
    return data;
  }

  _readAndDecodeAddr() {
    const addr = this.bus.data - this.start;

    if (addr >= 0 && addr < this.data.length) {
      this._addr = addr;
      trace(
        `[${this.name}] this._addr = $${this._addr
          .toString(16)
          .padStart(4, "0")} (this.bus.data($${this.bus.data
          .toString(16)
          .padStart(4, "0")}) - this.start($${this.start
          .toString(16)
          .padStart(4, "0")}))`,
      );
    } else {
      this._addr = null;
    }
  }

  _assertDataAtAddrToBus() {
    if (this._addr == null) return;

    const data = this.data[this._addr];
    if (data == null) return;
    trace(
      `[${this.name}] this.bus.data = $${data
        .toString(16)
        .padStart(4, "0")} (this._addr($${this._addr
        .toString(16)
        .padStart(4, "0")}))`,
    );
    this.bus.data = data;
    this._addr = null;
  }

  _readDataOnBusToAddr() {
    if (this._addr == null) return;

    this.data[this._addr] = this.bus.data;
  }

  clock(): void {
    // trace(this.name);
    this.ticks = (this.ticks + 1) % 4;

    switch (this.bus.flags) {
      case Bus.BAR: {
        // During this phase, the CPU asserts the address for the current memory
        // access. All devices on the bus are expected to latch this address and
        // perform address decoding at this time.
        // Latch the decoded address from the bus if it falls within our address
        // range:
        if (this.ticks === 3) return this._readAndDecodeAddr();
        return;
      }
      case Bus.DTB: {
        // This phase is entered during a read cycle. During this phase, the
        // currently addressed device should assert its data on the bus. The CPU
        // then reads this data.
        if (this.ticks === 1) return this._assertDataAtAddrToBus();
        return;
      }
      case Bus.ADAR: {
        // This bus phase is issued by the CPU during a Direct Addressing Mode
        // instruction. Prior to this phase, an address will have been latched
        // in a device by a prior BAR or ADAR bus phase.
        //
        // Then, during this phase, the currently selected device responds with
        // its data on the bus, and at the end of this phase, all devices should
        // latch this address as the address for the next memory access (DTB,
        // DW, or DWS phases).
        //
        // The CPU asserts nothing during this phase -- rather, it expects the
        // currently addressed device to inform the rest of the machine of the
        // address for the next access.
        if (this.ticks === 1) return this._assertDataAtAddrToBus();
        if (this.ticks === 3) return this._readAndDecodeAddr();
        return;
      }
      case Bus.DW: {
        return;
      }
      case Bus.DWS: {
        // The DW and DWS bus phases initiate a write cycle. They always occur
        // together on adjacent cycles, with data remaining stable on the bus
        // across the transition from DW to DWS. During these phases, the data
        // being written is available for external memories to latch. The
        // CP-1600 allows two full CPU cycles for external RAM to latch the
        // data.
        if (this.ticks === 3) return this._readDataOnBusToAddr();
        return;
      }
      case Bus.IAB: {
        // This bus phase is entered during interrupt processing, after the
        // current program counter has been written to the stack. It's also
        // entered into on the first cycle after coming out of RESET. During
        // this phase, an external device should assert the address of the
        // Interrupt or RESET vector as appropriate. The CPU then moves this
        // address into the program counter and resumes execution.
        if (this.ticks === 1) return this._assertDataAtAddrToBus();
        return;
      }
      case Bus.INTAK: {
        // The CPU enters this bus phase on the first cycle of interrupt
        // processing. During the phase, the CPU places the current stack
        // pointer value on the bus as it prepares to "push" the current program
        // counter on the stack. Devices are expected to treat INTAK similarly
        // to a BAR bus phase. Indeed, on the Intellivision Master Component,
        // only the 16-bit System RAM sees the INTAK bus phase. It uses this bus
        // phase to trigger a special bus-copy mode as well as for latching the
        // current address. For all other devices in the system, INTAK is
        // remapped to BAR by some discrete logic, and so is processed as a
        // normal addressing cycle elsewhere.
        return;
      }
      case Bus.___: {
        // During this stage, no device is active on the bus. DB0 through DB15
        // are allowed to float, with their previous driven value fading away
        // during this phase.
        return;
      }
      default: {
        throw new UnreachableCaseError(this.bus.flags);
      }
    }
  }
}
