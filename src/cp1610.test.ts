import {Bus, CP1610, RAM, ROM, forTestSuite} from "./cp1610";
import {describe, expect, test} from "vitest";
import fs from "fs";

const {decodeOpcode} = forTestSuite;

describe("CP1610", () => {
  test("Basic RESET functionality", () => {
    const bus = new Bus();
    const cpu = new CP1610(bus);
    const step = () => {
      while (cpu.state !== "FETCH_OPCODE:BAR") {
        cpu.clock();
      }
    };

    expect(cpu.r[7]).toBe(0);
    expect(cpu.state).toBe("RESET:IAB");

    // Fake the exec ROM asserting the reset vector address on the bus:
    bus.data = 0x1000;

    step();
    expect(cpu.r[7]).toBe(0x1000);
    expect(cpu.state).toBe("FETCH_OPCODE:BAR");
  });
});

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

describe("bus devices", () => {
  test("basic instruction fetching and jumping", () => {
    const bus = new Bus();

    const execRomBuffer = fs.readFileSync("./roms/exec.bin");
    const execROMData = new Uint16Array(execRomBuffer.length / 2);
    for (let i = 0; i < execRomBuffer.length; i += 2) {
      execROMData[i / 2] = (execRomBuffer[i]! << 8) | execRomBuffer[i + 1]!;
    }

    const cpu = new CP1610(bus);

    const devices = [
      cpu,
      // Rough approximation of various RAM devices:
      new RAM(bus, 0x0000, 0x1000),
      // Rough approximation of EXEC ROM
      new ROM(bus, 0x1000, execROMData),
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
