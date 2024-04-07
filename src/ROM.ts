import {Bus} from "./Bus";
import {RAM} from "./RAM";

export class ROM extends RAM {
  name: string = "ROM";

  constructor(bus: Bus, start: number, data: Uint16Array) {
    super(bus, start, start + data.length);
    // Marginally wasteful since we throw out the original `data` - yeah yeah,
    // OOP is bad yadda yadda
    this.data = data;
  }

  _readDataOnBusToAddr() {
    // Do nothing. Hence, read-only.
  }
}
