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

// This data was derived from running a `D`ump command in jzIntv and inspecting `dump.cpu`:
// prettier-ignore
const cacheabilityMap = [
   /*0000-01ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   //  /*0200-03ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,
   // We manually set this range to 0 because these are "snoopable" i.e. this forces the bus sniffer to log these reads:
   /*0200-03ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*0400-05ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*0600-07ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*0800-09ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*0a00-0bff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*0c00-0dff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*0e00-0fff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*1000-11ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1200-13ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1400-15ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1600-17ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1800-19ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1a00-1bff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1c00-1dff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*1e00-1fff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*2000-21ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2200-23ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2400-25ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2600-27ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2800-29ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2a00-2bff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2c00-2dff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*2e00-2fff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*3000-31ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*3200-33ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*3400-35ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*3600-37ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*3800-39ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*3a00-3bff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*3c00-3dff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*3e00-3fff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*4000-41ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*4200-43ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*4400-45ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*4600-47ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   
   // Assume cart ROM from $4800 - $7000 - TODO: Programmatically determine this?
   /*4800-49ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*4a00-4bff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*4c00-4dff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*4e00-4fff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5000-51ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5200-53ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5400-55ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5600-57ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5800-59ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5a00-5bff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5c00-5dff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*5e00-5fff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6000-61ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6200-63ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6400-65ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6600-67ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6800-69ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6a00-6bff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6c00-6dff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*6e00-6fff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
   /*7000-71ff*/ 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,

   /*7200-73ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*7400-75ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*7600-77ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*7800-79ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*7a00-7bff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*7c00-7dff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*7e00-7fff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8000-81ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8200-83ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8400-85ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8600-87ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8800-89ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8a00-8bff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8c00-8dff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*8e00-8fff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9000-91ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9200-93ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9400-95ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9600-97ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9800-99ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9a00-9bff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9c00-9dff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*9e00-9fff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*a000-a1ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*a200-a3ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*a400-a5ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*a600-a7ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*a800-a9ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*aa00-abff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ac00-adff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ae00-afff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*b000-b1ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*b200-b3ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*b400-b5ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*b600-b7ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*b800-b9ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ba00-bbff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*bc00-bdff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*be00-bfff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*c000-c1ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*c200-c3ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*c400-c5ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*c600-c7ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*c800-c9ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ca00-cbff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*cc00-cdff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ce00-cfff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*d000-d1ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*d200-d3ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*d400-d5ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*d600-d7ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*d800-d9ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*da00-dbff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*dc00-ddff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*de00-dfff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*e000-e1ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*e200-e3ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*e400-e5ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*e600-e7ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*e800-e9ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ea00-ebff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ec00-edff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*ee00-efff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*f000-f1ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*f200-f3ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*f400-f5ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*f600-f7ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*f800-f9ff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*fa00-fbff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*fc00-fdff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   /*fe00-ffff*/ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
];

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
         * Reads ~never~ rarely seem to be logged twice in jzIntv's debugger
         * output, so I'm only logging them the first time by tracking which
         * addresses we've seen already.
         *
         * This could easily be a coincidence since I'm only looking at the
         * first 1000 steps of a program, but for now this allows me to progress
         * as it seems to lead to valid output.
         *
         * This seems to be true for all addresses after we leave the EXEC ROM,
         * but we still see two reads of $4800 in the log which are definitely
         * in ROM.
         *
         * Looking at the jzIntv source code, it appears there are two main
         * conditions that prevent the read from being logged:
         *
         * 1. The peripheral "requesting" the read is the same as the peripheral
         *    handling the read.
         * 2. The `debug->show_rd` flag is not set.
         *
         * The logic that controls `show_rd` is somewhat convoluted, so trying
         * to understand that might be tricky. However we may not need to, if we
         * can force the `WATCHING(a,r)` condition to be true which overrides
         * this flag.
         *
         * We might be able to manually watch ALL addresses in the valid range
         * to force all reads to be logged at all times...
         *
         * I attempted to issue `w 0 ffff` and `@ 0 ffff` commands to watch
         * reads/writes on the full 16 bit address range, but this didn't change
         * anything.
         *
         * Update:
         *
         * Okay, when inspecting `dump.cpu` from issuing the `D`ump command, I
         * noticed a `Cacheability Map`, which really does suggest there's
         * caching going on which prevents reads from appearing in the logs.
         *
         * Looking further into jzIntv source code, it's unclear whether these
         * are done purely for emulation performance, or because the CP1600
         * itself actually does cache instructions. I couldn't find any
         * documentation in the 1975 manual about an instruction cache, but
         * here's a snippet of documentation from jzIntv's source code:
         *
         * > Since the CP1600 tries to cache decoded instructions, the CP1600
         * > state structure also includes "cacheable" bits for each 'page' of
         * > memory.  If a page is not marked "cacheable", then no instruction
         * > spanning that page is allowed to be "cached".  The page size for
         * > the cacheability bits is identical to the decoding page size.
         *
         * Again, it's unclear here if this is for accuracy or performance
         * alone. Either way, we should be able to use the `Cacheability Map` to
         * disable logging for those, at least for now. If we determine later
         * that this indeed is how the hardware _behaves_, we can push this
         * logic up into the emulator implementation.
         */
        cachedReads = new Set<number>();
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
                if (!this.cachedReads.has(this.addr)) {
                  if (this.addrIsCachable()) this.cachedReads.add(this.addr);
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
                if (!this.cachedReads.has(this.addr)) {
                  if (this.addrIsCachable()) this.cachedReads.add(this.addr);
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

        addrIsCachable(): boolean {
          return (
            Boolean(cacheabilityMap[this.addr >> 4]) &&
            // DOUBLE HACK: Not sure why but we print reads of $4800 multiple times
            // early in the program unlike most other ROM addresses:
            this.addr !== 0x4800
          );
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

            if (rr !== 0b11) {
              mnemonic += "SR";
            }

            switch (ff) {
              case 0b01: {
                mnemonic += "E";
                break;
              }
              case 0b10: {
                mnemonic += "D";
                break;
              }
            }

            if (regIndex !== null) {
              return `${mnemonic} R${regIndex},${$word(addr)}`;
            }
            return `${mnemonic} ${$word(addr)}`;
          }
          case "MVI": {
            return `${instruction.mnemonic} ${$word(
              peekBus(pc + 1),
            )},R${reg1Index}`;
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
            } else if (reg0Index === 7) {
              return `${instruction.mnemonic} R${reg1Index},#${$word(
                peekBus(pc + 1),
              )}`;
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
            return `XORR R${reg0Index},R${reg1Index}`;
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

          case "XORI":
          case "ANDI":
          case "CMPI":
          case "SUBI":
          case "ADDI": {
            return `${instruction.mnemonic} #${$word(
              peekBus(pc + 1),
            )},R${reg1Index}`;
          }
          case "XOR@":
          case "AND@":
          case "CMP@":
          case "SUB@":
          case "ADD@": {
            return `${instruction.mnemonic} R${reg0Index},R${reg1Index}`;
          }
          case "XOR":
          case "AND":
          case "CMP":
          case "SUB":
          case "ADD": {
            const addr = peekBus(pc + 1);
            return `${instruction.mnemonic} ${$word(addr)},R${reg1Index}`;
          }
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
        // Here we slice off the last two "status flags" for now.
        //
        // This ignores:
        // - Whether the last instruction is interruptable (something that the
        //   docs and jzIntv often disagree on; although I tend to trust jzIntv
        //   I want to understand what's going on before I start following its
        //   lead)
        // - Interrupt system status. Right now I'm focusing just on basic
        //   instruction support, and I'll move on to external device support
        //   once I feel that's in a good enough place.
        const flags = m[3]?.trim().slice(0, 6);
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
      const extraLines = 5;
      for (let i = 1; i < normalizedLog.length; i += 1) {
        const prefixLine = (line: string, j: number) =>
          `${(i + j + 1 - extraLines).toString(10).padStart(4, " ")}: ` + line;

        expect(
          normalizedLog
            .slice(i - extraLines, i)
            .map(prefixLine)
            .join("\n"),
        ).toEqual(
          normalizedExpectedLog
            .slice(i - extraLines, i)
            .map(prefixLine)
            .join("\n"),
        );
      }
    });
  }
});
