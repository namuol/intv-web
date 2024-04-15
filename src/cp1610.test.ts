import {describe, expect, test} from "vitest";
import fs from "fs";
import glob from "glob-promise";

import {ROM} from "./ROM";
import {RAM} from "./RAM";
import {Bus, BusDevice} from "./Bus";
import {UnreachableCaseError} from "./UnreachableCaseError";
import {CP1610} from "./cp1610";
import {decodeOpcode} from "./decodeOpcode";

const readRomIntoUint16Array = (path: string) => {
  const romBuffer = fs.readFileSync(path);
  const romData = new Uint16Array(romBuffer.length / 2);
  for (let i = 0; i < romBuffer.length; i += 2) {
    romData[i / 2] = (romBuffer[i]! << 8) | romBuffer[i + 1]!;
  }
  return romData;
};

const $word = (n: number) => "$" + word(n);
const word = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

const getMappingStartFromCfg = async (path: string): Promise<number> => {
  const configText = await fs.promises.readFile(path, "utf-8");
  // prettier-ignore
  const startStr = configText.split('\n')[1]?.split(' ')[4]?.slice(1);
  if (!startStr) throw new Error(`Failed to get mapping start from "${path}"`);
  return parseInt(startStr, 16);
};

describe("jzIntv fixtures", async () => {
  // TODO: For now, plopping this code into one place for quick iteration, but
  // once a good pattern emerges from this we can pull it out into a test/debug
  // module.

  const fixtures = await glob("./test-roms/*.jzintv.txt");
  for (const fixturePath of fixtures) {
    test(fixturePath, async () => {
      class BusSniffer implements BusDevice {
        bus: Bus;
        ticks: number = 0;
        addr: number = 0xffff;
        data: number = 0xffff;
        /**
         * HACK
         *
         * Reads never seem to be logged twice in jzIntv's debugger output, so
         * I'm only logging them the first time by tracking which addresses
         * we've seen already.
         *
         * This could easily be a coincidence since I'm only looking at the
         * first 1000 steps of a program, but for now this allows me to progress
         * as it seems to lead to valid output.
         */
        seenReads = new Set<number>();
        onBusActivity: (logLine: string) => void;

        constructor(bus: Bus, onBusActivity: (logLine: string) => void) {
          this.bus = bus;
          this.onBusActivity = onBusActivity;
        }

        clock(): void {
          this.ticks = (this.ticks + 1) % 4;
          switch (this.bus.flags) {
            case Bus.BAR: {
              // During this phase, the CPU asserts the address for the current memory
              // access. All devices on the bus are expected to latch this address and
              // perform address decoding at this time.

              // Latch the decoded address from the bus if it falls within our address
              // range:
              if (this.ticks === 3) this.addr = this.bus.data;
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
              if (this.ticks === 3) {
                if (!this.seenReads.has(this.addr)) {
                  if (this.addr !== 0x4800) this.seenReads.add(this.addr);
                  this.onBusActivity(
                    `RD a=${$word(this.addr)} d=${word(
                      this.bus.data,
                    )} CP-1610 (PC = ${$word(cpu.r[7])}) t=${stepCycle}`,
                  );
                  // console.error(log.at(-1), cpu.busSequence, cpu.busSequenceIndex, this.bus.toString())
                }
                this.addr = this.bus.data;
              }
              return;
            }
            case Bus.DTB: {
              // This phase is entered during a read cycle. During this phase, the
              // currently addressed device should assert its data on the bus. The CPU
              // then reads this data.
              if (this.ticks === 1) {
                this.data = this.bus.data;
                if (!this.seenReads.has(this.addr)) {
                  if (this.addr !== 0x4800) this.seenReads.add(this.addr);
                  this.onBusActivity(
                    `RD a=${$word(this.addr)} d=${word(
                      this.data,
                    )} CP-1610 (PC = ${$word(cpu.r[7])}) t=${stepCycle}`,
                  );
                  // console.error(
                  //   log.at(-1),
                  //   cpu.busSequence,
                  //   cpu.busSequenceIndex,
                  //   this.bus.toString(),
                  // );
                }
              }
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
              if (this.ticks === 3) {
                this.data = this.bus.data;
                this.onBusActivity(
                  `WR a=${$word(this.addr)} d=${word(
                    this.data,
                  )} CP-1610 (PC = ${$word(cpu.r[7])}) t=${stepCycle}`,
                );
              }
              return;
            }
            case Bus.IAB: {
              // This bus phase is entered during interrupt processing, after the
              // current program counter has been written to the stack. It's also
              // entered into on the first cycle after coming out of RESET. During
              // this phase, an external device should assert the address of the
              // Interrupt or RESET vector as appropriate. The CPU then moves this
              // address into the program counter and resumes execution.
              // if (this.ticks === 1) return this._assertDataAtAddrToBus();
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

        debug_read(_addr: number): number | null {
          return null;
        }
      }

      const expectedLog = (
        await fs.promises.readFile(fixturePath, {encoding: "utf-8"})
      ).split("\n");
      const romPath =
        "./test-roms/" +
        fixturePath.split(".jzintv.txt")[0]?.split("/").at(-1) +
        ".bin";

      const bus = new Bus();
      const cpu = new CP1610(bus);
      const log: string[] = [];
      const busSniffer = new BusSniffer(bus, (busLog) => log.push(busLog));
      const devices = [
        cpu,
        // Rough approximation of various RAM devices:
        new RAM(bus, 0x0000, 0x1000),
        // Rough approximation of EXEC ROM:
        new ROM(bus, 0x1000, readRomIntoUint16Array("./roms/exec.bin")),
        new ROM(
          bus,
          await getMappingStartFromCfg(romPath.replace(/.bin$/, ".cfg")),
          readRomIntoUint16Array(romPath),
        ),
        busSniffer,
      ];
      let cycles = 0;
      const tick = () => {
        cycles += 1;
        bus.clock();
        devices.forEach((device) => device.clock());
      };

      let stepCycle = 0;
      const step = () => {
        stepCycle = Math.max(0, cycles) / 4;
        log.push(cpuStatus());

        let fetched = false;
        cpu.onInstructionFetch = () => {
          fetched = true;
        };

        while (!fetched && !cpu.halted) {
          tick();
        }
      };

      const peekBus = (addr: number) => {
        for (const device of devices) {
          const data = device.debug_read(addr);
          if (data != null) return data;
        }
        return 0xffff;
      };
      const peekBusSDBD = (addr: number) => {
        return ((peekBus(addr + 1) & 0x00ff) << 8) | (peekBus(addr) & 0x00ff);
      };

      const cpuFlags = () => {
        let prevInstruction = cycles / 4 > 13 ? decodeOpcode(cpu.opcode) : null;

        return [
          cpu.s ? "S" : "-",
          cpu.z ? "Z" : "-",
          cpu.o ? "O" : "-",
          cpu.c ? "C" : "-",
          cpu.i ? "I" : "-",
          cpu.d ? "D" : "-",
          prevInstruction?.interruptable ? "i" : "-",
          "-", // TODO: interrupt state info
        ].join("");
      };

      const cpuCurrentInstruction = () => {
        const pc = cpu.r[7];
        const opcode = peekBus(pc);
        const instruction = decodeOpcode(opcode);
        const reg0Index = (0b0000_0000_0011_1000 & opcode) >> 3;
        const reg1Index = 0b0000_0000_0000_0111 & opcode;

        if (!instruction) return "UNKNOWN";
        switch (instruction.mnemonic) {
          case "J": {
            const arg0 = peekBus(pc + 1);
            const arg1 = peekBus(pc + 2);
            const rr = (0b0000_0011_0000_0000 & arg0) >> 8;
            const ff = 0b0000_0000_0000_0011 & arg0;
            const addr =
              ((0b0000_0000_1111_1100 & arg0) << 8) |
              (0b0000_0011_1111_1111 & arg1);
            let mnemonic: string = instruction.mnemonic;
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
            switch (rr) {
              case 0b00:
              case 0b01:
              case 0b10: {
                switch (ff) {
                  case 0b00: {
                    mnemonic = "JSR";
                    break;
                  }
                  case 0b01: {
                    mnemonic = "JSRE";
                    break;
                  }
                  case 0b10: {
                    mnemonic = "JSRD";
                    break;
                  }
                }
                break;
              }
            }
            if (regIndex !== null) {
              return `${mnemonic} R${regIndex},${$word(addr)}`;
            }
            return mnemonic;
          }
          case "MVI": {
            return `${instruction.mnemonic},${$word(
              peekBus(pc + 1),
            )},R${reg0Index}`;
          }
          case "MVI@":
          case "MVII": {
            if (reg0Index === 6) {
              return `PULR R${reg1Index}`;
            } else if (reg0Index === 7) {
              const data = cpu.d ? peekBusSDBD(pc + 1) : peekBus(pc + 1);
              return `MVII #${$word(data)},R${reg1Index}`;
            } else {
              return `MVI@ R${reg0Index},R${reg1Index}`;
            }
          }
          case "MVO":
            return `${instruction.mnemonic} R${reg1Index},${$word(
              peekBus(pc + 1),
            )}`;
          case "MVO@":
          case "MVOI": {
            if (reg0Index === 6) {
              return `PSHR R${reg1Index}`;
            } else {
              return `${instruction.mnemonic} R${reg1Index},R${reg0Index}`;
            }
          }

          case "MOVR": {
            if (reg1Index === 7) {
              return `JR R${reg0Index}`;
            } else {
              return `${instruction.mnemonic} R${reg0Index},R${reg1Index}`;
            }
          }

          case "XORR": {
            if (reg0Index === reg1Index) {
              return `CLRR R${reg0Index}`;
            }
            return `XORR R${reg0Index}, R${reg1Index}`;
          }

          case "B": {
            const direction = 0b0000_0000_0010_0000 & opcode ? -1 : 1;
            const offset = peekBus(pc + 1);
            const addr =
              pc + (direction * offset + 1 + (direction > 0 ? 1 : 0));
            console.log({pc: word(pc), addr: word(addr), direction, offset});

            // prettier-ignore
            const mnemonic = (() => {
              if (opcode === 0x020F || opcode === 0x022F) {
                return'BEXT';
              }
              switch (0b0000_0000_0000_1111 & opcode) {
                case 0b0000: return 'B';
                case 0b0001: return 'BC';
                case 0b0010: return 'BOV';
                case 0b0011: return 'BPL';
                case 0b0101: return 'BLT';
                case 0b0110: return 'BLE';
                case 0b0111: return 'BUSC';
                case 0b1000: return 'NOPP';
                case 0b1001: return 'BNC';
                case 0b1010: return 'BNOV';
                case 0b1011: return 'BMI';
                case 0b1100: return 'BNEQ';
                case 0b1101: return 'BGE';
                case 0b1110: return 'BGT';
                case 0b1111: return 'BESC';
              }
            })();
            if (mnemonic === "B") return `${mnemonic},${$word(addr)}`;
            return `${mnemonic} ${$word(addr)}`;
          }
          case "SLL":
          case "RLC":
          case "SLLC":
          case "SLR":
          case "SAR":
          case "RRC":
          case "SARC":
          case "SWAP": {
            if (reg1Index & 0b100) {
              return `${instruction.mnemonic} R${reg1Index & 0b011},2`;
            } else {
              return `${instruction.mnemonic} R${reg1Index & 0b011}`;
            }
          }
          case "ADDR":
          case "SUBR":
          case "CMPR":
          case "ANDR":
          case "XORR": {
            return `${instruction.mnemonic} R${reg0Index},R${reg1Index}`;
          }

          case "ANDI": {
            const data = cpu.d ? peekBusSDBD(pc + 1) : peekBus(pc + 1);
            return `${instruction.mnemonic} #${$word(data)},R${reg1Index}`;
          }
          case "INCR":
          case "DECR":
          case "COMR":
          case "NEGR":
          case "ADCR":
          case "GSWD":
          case "RSWD":
            return `${instruction.mnemonic} R${reg1Index}`;
        }

        return instruction.mnemonic;
      };

      const cpuStatus = () => {
        const reg = (n: number) => word(n);
        return `${[...cpu.r]
          .map(reg)
          .join(" ")} ${cpuFlags()}  ${cpuCurrentInstruction()}  ${
          // HACKish cycle count offset
          stepCycle
        }`;
      };

      const normalizeCpuStatus = (line: string) => {
        if (!line) return line;
        // Now I've got two problems:
        const m = line.match(/^\s*(([0-9A-F]+ ){8})((.){8})\s+(.+)\s+(\d+)$/);
        if (!m)
          throw new Error('Could not parse CPU status line:\n"' + line + '"');
        const registers = m[1]?.trim();
        // Here we slice off the last status flag for now which deals with interrupt status info
        const flags = m[3]?.trim().slice(0, 7);
        const disassembly = m[5]?.trim()?.replaceAll(/\s+/g, " ");
        return `${registers} ${flags} ${disassembly}`;
      };

      const normalizeBusStatus = (line: string) => {
        const s = line.split(/ +/g);

        // TODO: It's unclear "when" CPU status is logged in jzIntv so I'm
        // disabling timing comparisons, for now.
        // return `${s[0]} ${s[1]} ${s[2]} ${s[7]}`;
        return `${s[0]} ${s[1]} ${s[2]}`;
      };

      const normalizeLine = (line: string) => {
        if (line.startsWith("RD") || line.startsWith("WR")) {
          return normalizeBusStatus(line);
        } else {
          return normalizeCpuStatus(line);
        }
      };

      // Hackish: Allow reset sequence to do its thing
      step();

      // Reset cycle count after reset:
      cycles = 0;
      log.length = 0;

      expect(expectedLog.length).toBeGreaterThan(0);

      while (log.length < expectedLog.length && !cpu.halted) {
        step();
      }

      const normalizedLog = log.map(normalizeLine);
      const normalizedExpectedLog = expectedLog.map(normalizeLine);
      for (let i = 0; i < normalizedLog.length; i += 1) {
        const prefixLine = (line: string, j: number) =>
          `${(j + 1).toString(10).padStart(4, " ")}: ` + line;

        expect(normalizedLog.slice(0, i).map(prefixLine).join("\n")).toEqual(
          normalizedExpectedLog.slice(0, i).map(prefixLine).join("\n"),
        );
      }
    });
  }
});
