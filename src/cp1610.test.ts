import {Bus, CP1610, forTestSuite} from "./cp1610";
import {describe, expect, test} from "vitest";
const {decodeOpcode} = forTestSuite;

describe("CP1610", () => {
  test("Basic RESET functionality", () => {
    const bus = new Bus();
    const cpu = new CP1610(bus);

    expect(cpu.pc).toBe(0);
    expect(cpu.state).toBe("RESET:IAB");

    // Fake the exec ROM asserting the reset vector address on the bus:
    bus.data = 0x1000;

    cpu.step();
    expect(cpu.pc).toBe(0x1000);
    expect(cpu.state).toBe("FETCH_OPCODE:BAR");
  });
});

describe("decodeOpcode", () => {
  const tests = [
    {addrs: [0x0000], mnemonics: ["HLT"]},
    {addrs: [0x0001], mnemonics: ["SDBD"]},
    {addrs: [0x0004], mnemonics: ["J", "JE", "JD", "JSR", "JSRE", "JSRD"]},
    {
      addrs: [0x0200, 0x222, 0x23f],
      mnemonics: [
        "B",
        "BC",
        "BOV",
        "BPL",
        "BEQ",
        "BLT",
        "BLE",
        "BUSC",
        "NOPP",
        "BNC",
        "BNOV",
        "BMI",
        "BNEQ",
        "BGE",
        "BGT",
        "BESC",
        "BEXT",
      ],
    },
  ];
  for (const {addrs, mnemonics} of tests) {
    test(mnemonics.join("/"), () => {
      for (const addr of addrs) {
        const decoded = decodeOpcode(addr);
        expect(decoded).toBeDefined();
        expect(Object.keys(decoded!).length).toBe(mnemonics.length);
        for (const mnemonic of mnemonics) {
          expect(decoded![mnemonic]).toBeDefined();
        }
      }
    });
  }
});
