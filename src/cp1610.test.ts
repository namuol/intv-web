import {Bus, CP1610, forTestSuite} from "./cp1610";
import {describe, expect, test} from "vitest";
const {decodeOpcode} = forTestSuite;

describe("CP1610", () => {
  test("Basic RESET functionality", () => {
    const bus = new Bus();
    const cpu = new CP1610(bus);

    expect(cpu.r[7]).toBe(0);
    expect(cpu.state).toBe("RESET:IAB");

    // Fake the exec ROM asserting the reset vector address on the bus:
    bus.data = 0x1000;

    cpu.step();
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
