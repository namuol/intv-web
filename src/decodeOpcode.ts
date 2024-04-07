import { InstructionConfig } from "./InstructionConfig";
import instructions from "./instructions";

const opcodeLookup: InstructionConfig[] = [];
for (const [rangeKey, instructionConfig] of Object.entries(instructions)) {
  const [start, end = start] = rangeKey
    .split("-")
    .map((str) => parseInt(str, 16)) as [number, number | undefined];
  for (let i = start; i <= end; ++i) {
    opcodeLookup[i] = instructionConfig;
  }
}

export const decodeOpcode = (opcode: number): InstructionConfig | null => {
  return opcodeLookup[opcode] ?? null;
};
