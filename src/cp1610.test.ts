import {describe, expect, test} from "vitest";
import fs from "fs";
import glob from "glob-promise";

import {Bus, BusDevice, CP1610, RAM, ROM, forTestSuite} from "./cp1610";
import {UnreachableCaseError} from "./UnreachableCaseError";

const {decodeOpcode} = forTestSuite;

describe("decodeOpcode", () => {
  const tests = [
    {addrs: [0x0000], mnemonic: "HLT"},
    {addrs: [0x0001], mnemonic: "SDBD"},
    {addrs: [0x0004], mnemonic: "J"},
    {
      addrs: [0x0200, 0x222, 0x23f],
      mnemonic: "B",
    },
  ] as const;
  for (const {addrs, mnemonic} of tests) {
    test(mnemonic, () => {
      for (const addr of addrs) {
        const instructionConfig = decodeOpcode(addr);
        expect(instructionConfig).toBeDefined();
        expect(instructionConfig).toBeDefined();
        expect(instructionConfig?.mnemonic).toBe(mnemonic);
      }
    });
  }
});

const readRomIntoUint16Array = (path: string) => {
  const romBuffer = fs.readFileSync(path);
  const romData = new Uint16Array(romBuffer.length / 2);
  for (let i = 0; i < romBuffer.length; i += 2) {
    romData[i / 2] = (romBuffer[i]! << 8) | romBuffer[i + 1]!;
  }
  return romData;
};

describe("bus devices", () => {
  test("basic instruction fetching and jumping", () => {
    const bus = new Bus();
    const cpu = new CP1610(bus);
    const devices = [
      cpu,
      // Rough approximation of various RAM devices:
      new RAM(bus, 0x0000, 0x1000),
      // Rough approximation of EXEC ROM
      new ROM(bus, 0x1000, readRomIntoUint16Array("./roms/exec.bin")),
    ];
    const tick = () => devices.forEach((device) => device.clock());
    const microCycle = () => {
      tick();
      tick();
      tick();
      tick();
    };

    const step = () => {
      while (cpu.state !== "FETCH_OPCODE:BAR") {
        tick();
      }
    };

    // Initialization sequence; CPU should first initialize its PC to $1000:
    microCycle();
    expect(cpu.r[7]).toEqual(0x1000);

    // Wait one NACT cycle:
    expect(bus.flags).toBe(Bus.___);
    microCycle();
    // Begin opcode fetch; CPU should assert PC to bus:
    expect(bus.flags).toBe(Bus.BAR);
    microCycle();
    expect(bus.data).toBe(0x1000);
    expect(cpu.r[7]).toBe(0x1001);
    // NACT:
    expect(bus.flags).toBe(Bus.___);
    microCycle();
    // Now the ROM should assert data at $1000 to bus:
    expect(bus.flags).toBe(Bus.DTB);
    microCycle();
    expect(bus.data).toBe(0x0004);
    // ...and the CPU should have read the bus data into its next opcode
    expect(cpu.opcode).toBe(0x0004);

    // While in NACT, CPU then decodes the opcode into an instruction
    expect(bus.flags).toBe(Bus.___);
    microCycle();

    // ...which should be JUMP instruction
    expect(cpu.instruction?.mnemonic).toBe("J");

    // Now we should read two more decles as arguments to the Jump instruction

    // Read first argument...
    {
      expect(bus.flags).toBe(Bus.BAR);
      microCycle();
      expect(bus.data).toBe(0x1001);

      expect(bus.flags).toBe(Bus.___);
      microCycle();

      expect(bus.flags).toBe(Bus.DTB);
      microCycle();
      expect(bus.data).toBe(0x0112);
      // First argument read:
      expect(cpu.args[0]).toBe(0x0112);

      expect(bus.flags).toBe(Bus.___);
      microCycle();
    }

    // Read second argument...
    {
      expect(bus.flags).toBe(Bus.BAR);
      microCycle();
      expect(bus.data).toBe(0x1002);

      expect(bus.flags).toBe(Bus.___);
      microCycle();

      expect(bus.flags).toBe(Bus.DTB);
      microCycle();
      expect(bus.data).toBe(0x0026);
      // Second argument read:
      expect(cpu.args[1]).toBe(0x0026);

      expect(bus.flags).toBe(Bus.___);
      microCycle();
    }

    // Skip over the rest of the NACTs:
    step();

    expect(cpu.r[7]).toBe(0x1026);
    // JSRD should disable Interrupt Enable flag
    expect(cpu.i).toBe(false);
    // Return address should be stored in R5
    expect(cpu.r[5]).toBe(0x1003);

    expect(bus.flags).toBe(Bus.___);
    microCycle();

    // Begin opcode fetch; CPU should assert PC to bus:
    expect(bus.flags).toBe(Bus.BAR);
    microCycle();
    expect(bus.data).toBe(0x1026);
    expect(cpu.r[7]).toBe(0x1027);
    // NACT:
    expect(bus.flags).toBe(Bus.___);
    microCycle();
    // Now the ROM should assert data at $1026 to bus:
    expect(bus.flags).toBe(Bus.DTB);
    microCycle();
    expect(bus.data).toBe(0x02be);
    // ...and the CPU should have read the bus data into its next opcode
    expect(cpu.opcode).toBe(0x02be);

    // While in NACT, CPU then decodes the opcode into an instruction
    expect(bus.flags).toBe(Bus.___);
    microCycle();

    // ...which should be MVII instruction
    expect(cpu.instruction?.mnemonic).toBe("MVII");
  });
});

const $word = (n: number) => "$" + word(n);
const word = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

describe("jzIntv fixtures", async () => {
  // TODO: For now, plopping this code into one place for quick iteration, but
  // once a good pattern emerges from this we can pull it out into a test/debug
  // module.

  const fixtures = await glob("./src/fixtures/*.jzintv.txt");
  console.log("fixtures", fixtures);
  for (const fixturePath of fixtures) {
    test(fixturePath, async () => {
      class BusSniffer implements BusDevice {
        bus: Bus;
        ticks: number = 0;
        addr: number = 0xffff;
        data: number = 0xffff;
        log: string[] = [];
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
        constructor(bus: Bus) {
          this.bus = bus;
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
              if (this.ticks === 3) this.addr = this.bus.data;
              return;
            }
            case Bus.DTB: {
              // This phase is entered during a read cycle. During this phase, the
              // currently addressed device should assert its data on the bus. The CPU
              // then reads this data.
              if (this.ticks === 1) {
                this.data = this.bus.data;
                if (!this.seenReads.has(this.addr)) {
                  this.seenReads.add(this.addr);
                  this.log.push(
                    `RD a=${$word(this.addr)} d=${word(this.data)} ${
                      cpu.state
                    }`,
                  );
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
                this.log.push(
                  `WR a=${$word(this.addr)} d=${word(this.data)} ${cpu.state}`,
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

        debug_read(addr: number): number | null {
          throw new Error("Method not implemented.");
        }
      }

      const lines = (
        await fs.promises.readFile(fixturePath, {encoding: "utf-8"})
      ).split("\n");
      const romPath =
        "./roms/" + fixturePath.split(".jzintv.txt")[0]?.split("/").at(-1);

      const bus = new Bus();
      const cpu = new CP1610(bus);
      const busSniffer = new BusSniffer(bus);

      const devices = [
        cpu,
        // Rough approximation of various RAM devices:
        new RAM(bus, 0x0000, 0x1000),
        // Rough approximation of EXEC ROM:
        new ROM(bus, 0x1000, readRomIntoUint16Array("./roms/exec.bin")),
        new ROM(bus, 0x5000, readRomIntoUint16Array(romPath)),
        busSniffer,
      ];
      let cycles = 0;
      const tick = () => {
        cycles += 1;
        devices.forEach((device) => device.clock());
      };

      const step = () => {
        while (cpu.state === "FETCH_OPCODE:BAR") {
          tick();
        }
        // @ts-ignore
        while (cpu.state !== "FETCH_OPCODE:BAR") {
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

      const cpuFlags = () =>
        [
          cpu.s ? "S" : "-",
          cpu.z ? "Z" : "-",
          cpu.o ? "O" : "-",
          cpu.c ? "C" : "-",
          cpu.i ? "I" : "-",
          cpu.d ? "D" : "-",
          cpu.prevInstruction?.interruptible ? "i" : "-",
          "-", // TODO: interrupt state info
        ].join("");

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
                    mnemonic = "JSR,";
                    break;
                  }
                  case 0b01: {
                    mnemonic = "JSRE ";
                    break;
                  }
                  case 0b10: {
                    mnemonic = "JSRD ";
                    break;
                  }
                }
                break;
              }
            }
            if (regIndex !== null) {
              return `${mnemonic}R${regIndex},${$word(addr)}`;
            }
            return mnemonic;
          }
          case "MVI@":
          case "MVII": {
            if (reg0Index === 6) {
              return `PULR R${reg1Index}`;
            } else {
              const data = peekBus(pc + 1);
              return `MVII #${$word(data)},R${reg1Index}`;
            }
          }
          case "MVO":
            return `${instruction.mnemonic},R${reg1Index},${$word(
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

          case "XORR": {
            if (reg0Index === reg1Index) {
              return `CLRR R${reg0Index}`;
            }
            return `XORR R${reg0Index}, R${reg1Index}`;
          }

          case "DECR": {
            return `DECR R${reg1Index}`;
          }

          case "B": {
            const direction = 0b0000_0000_0010_0000 & opcode ? -1 : 1;
            const addr = pc + (direction * peekBus(pc + 1) + 1);

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
            return `${mnemonic} ${$word(addr)}`;
          }
        }

        return instruction.mnemonic;
      };

      const cpuStatus = () => {
        const reg = (n: number) => word(n);
        return `${[...cpu.r]
          .map(reg)
          .join(" ")} ${cpuFlags()}  ${cpuCurrentInstruction()}|${cycles / 4}`;
      };

      const busStatus = (): string => {
        const [lastLog] = busSniffer.log.splice(0, 1);
        if (lastLog == null) return "BUS INACTIVE";
        return lastLog;
      };

      const normalizeCpuStatus = (line: string) =>
        line
          .replace(/  +/g, "|")
          // TODO: Do we want to try and match cycle count of jzIntv?
          .split("|")
          .slice(0, -1)
          .join(",");

      const normalizeBusStatus = (line: string) =>
        line.split(" ").slice(0, 3).join(" ");
      const normalizeLine = (line: string) => {
        if (line.startsWith("RD") || line.startsWith("WR")) {
          return normalizeBusStatus(line);
        } else {
          return normalizeCpuStatus(line);
        }
      };
      // Hackish: Allow reset sequence to do its thing
      step();
      expect(cpu.state).toMatchInlineSnapshot(`"FETCH_OPCODE:BAR"`);
      // Reset cycle count after reset:
      cycles = 0;

      expect(lines.length).toBeGreaterThan(0);
      let prevLines: string[] = [];
      for (let lineNumber = 0; lineNumber < lines.length; ++lineNumber) {
        // First account for any bus activity:
        for (const busLogLine of busSniffer.log) {
          console.log(busLogLine);
          const line_ = lines[lineNumber]!;
          const prefix = `${(lineNumber + 1).toString(10).padStart(4, " ")}: `;
          const line = prefix + normalizeLine(line_);
          const prev = prevLines.slice(-20).join("\n");
          expect(
            (prev ? prev + "\n" : "") + prefix + normalizeBusStatus(busLogLine),
          ).toEqual((prev ? prev + "\n" : "") + line);
          prevLines.push(line);
          lineNumber += 1;
        }
        // Reset bus activity log
        busSniffer.log.length = 0;

        const line_ = lines[lineNumber]!;
        const prefix = `${(lineNumber + 1).toString(10).padStart(4, " ")}: `;
        const line = prefix + normalizeCpuStatus(line_);
        const prev = prevLines.slice(-20).join("\n");
        expect(
          (prev ? prev + "\n" : "") + prefix + normalizeCpuStatus(cpuStatus()),
        ).toEqual((prev ? prev + "\n" : "") + line);
        step();
        prevLines.push(line);
      }
    });
  }
});
