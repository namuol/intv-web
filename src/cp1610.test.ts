import {describe, expect, test} from "vitest";
import fs from "fs";
import glob from "glob-promise";

import {Bus, CP1610, RAM, ROM, forTestSuite} from "./cp1610";

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
    expect(bus.flags).toBe(Bus.NACT);
    microCycle();
    // Begin opcode fetch; CPU should assert PC to bus:
    expect(bus.flags).toBe(Bus.BAR);
    microCycle();
    expect(bus.data).toBe(0x1000);
    expect(cpu.r[7]).toBe(0x1001);
    // NACT:
    expect(bus.flags).toBe(Bus.NACT);
    microCycle();
    // Now the ROM should assert data at $1000 to bus:
    expect(bus.flags).toBe(Bus.DTB);
    microCycle();
    expect(bus.data).toBe(0x0004);
    // ...and the CPU should have read the bus data into its next opcode
    expect(cpu.opcode).toBe(0x0004);

    // While in NACT, CPU then decodes the opcode into an instruction
    expect(bus.flags).toBe(Bus.NACT);
    microCycle();

    // ...which should be JUMP instruction
    expect(cpu.instruction?.mnemonic).toBe("J");

    // Now we should read two more decles as arguments to the Jump instruction

    // Read first argument...
    {
      expect(bus.flags).toBe(Bus.BAR);
      microCycle();
      expect(bus.data).toBe(0x1001);

      expect(bus.flags).toBe(Bus.NACT);
      microCycle();

      expect(bus.flags).toBe(Bus.DTB);
      microCycle();
      expect(bus.data).toBe(0x0112);
      // First argument read:
      expect(cpu.args[0]).toBe(0x0112);

      expect(bus.flags).toBe(Bus.NACT);
      microCycle();
    }

    // Read second argument...
    {
      expect(bus.flags).toBe(Bus.BAR);
      microCycle();
      expect(bus.data).toBe(0x1002);

      expect(bus.flags).toBe(Bus.NACT);
      microCycle();

      expect(bus.flags).toBe(Bus.DTB);
      microCycle();
      expect(bus.data).toBe(0x0026);
      // Second argument read:
      expect(cpu.args[1]).toBe(0x0026);

      expect(bus.flags).toBe(Bus.NACT);
      microCycle();
    }

    // Skip over the rest of the NACTs:
    step();

    expect(cpu.r[7]).toBe(0x1026);
    // JSRD should disable Interrupt Enable flag
    expect(cpu.i).toBe(false);
    // Return address should be stored in R5
    expect(cpu.r[5]).toBe(0x1003);

    expect(bus.flags).toBe(Bus.NACT);
    microCycle();

    // Begin opcode fetch; CPU should assert PC to bus:
    expect(bus.flags).toBe(Bus.BAR);
    microCycle();
    expect(bus.data).toBe(0x1026);
    expect(cpu.r[7]).toBe(0x1027);
    // NACT:
    expect(bus.flags).toBe(Bus.NACT);
    microCycle();
    // Now the ROM should assert data at $1026 to bus:
    expect(bus.flags).toBe(Bus.DTB);
    microCycle();
    expect(bus.data).toBe(0x02be);
    // ...and the CPU should have read the bus data into its next opcode
    expect(cpu.opcode).toBe(0x02be);

    // While in NACT, CPU then decodes the opcode into an instruction
    expect(bus.flags).toBe(Bus.NACT);
    microCycle();

    // ...which should be MVII instruction
    expect(cpu.instruction?.mnemonic).toBe("MVII");
  });
});

const word = (n: number) => "$" + n.toString(16).toUpperCase().padStart(4, "0");

describe("jzIntv fixtures", async () => {
  // TODO: For now, plopping this code into one place for quick iteration, but
  // once a good pattern emerges from this we can pull it out into a test/debug
  // module.

  const fixtures = await glob("./src/fixtures/*.jzintv.txt");
  console.log("fixtures", fixtures);
  for (const fixturePath of fixtures) {
    test(fixturePath, async () => {
      const lines = (
        await fs.promises.readFile(fixturePath, {encoding: "utf-8"})
      ).split("\n");
      const romPath =
        "./roms/" + fixturePath.split(".jzintv.txt")[0]?.split("/").at(-1);

      const bus = new Bus();
      const cpu = new CP1610(bus);
      const devices = [
        cpu,
        // Rough approximation of various RAM devices:
        new RAM(bus, 0x0000, 0x1000),
        // Rough approximation of EXEC ROM:
        new ROM(bus, 0x1000, readRomIntoUint16Array("./roms/exec.bin")),
        new ROM(bus, 0x5000, readRomIntoUint16Array(romPath)),
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
              return `${mnemonic}R${regIndex},${word(addr)}`;
            }
            return mnemonic;
          }
          case "MVII": {
            const data = peekBus(pc + 1);
            return `MVII #${word(data)},R${reg1Index}`;
          }

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
        }

        return instruction.mnemonic;
      };

      const cpuStatus = () => {
        const reg = (n: number) =>
          n.toString(16).toUpperCase().padStart(4, "0");
        return `${[...cpu.r]
          .map(reg)
          .join(" ")} ${cpuFlags()}  ${cpuCurrentInstruction()}|${cycles / 4}`;
      };

      const normalizeLine = (line: string) =>
        line
          .replace(/  +/g, "|")
          // TODO: Do we want to try and match cycle count of jzIntv?
          .split("|")
          .slice(0, -1).join(',');

      // Hackish: Allow reset sequence to do its thing
      step();
      expect(cpu.state).toMatchInlineSnapshot(`"FETCH_OPCODE:BAR"`);
      // Reset cycle count after reset:
      cycles = 0;

      expect(lines.length).toBeGreaterThan(0);
      let prevLine = null;
      for (let lineNumber = 0; lineNumber < lines.length; ++lineNumber) {
        const line_ = lines[lineNumber]!;
        // Not yet checking reads/writes
        if (line_.startsWith("RD") || line_.startsWith("WR")) continue;
        const prefix = `${lineNumber + 1}: `;
        const line = prefix + normalizeLine(line_);
        expect(
          (prevLine ? prevLine + "\n" : "") +
            prefix +
            normalizeLine(cpuStatus()),
        ).toEqual((prevLine ? prevLine + "\n" : "") + line);
        step();
        prevLine = line;
      }
    });
  }
});
