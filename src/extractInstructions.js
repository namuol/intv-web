// Run this with $0 being the selected instruction table on
// http://wiki.intellivision.us/index.php/CP1610 to extract instructions into a
// JSON table
//
// Some manual lookups for full instruction names for jump and branch
// instructions since they're not directly in the table.

str = (cell) => cell.innerText;
onlyTrue = (cell) => (cell.innerText ? true : undefined);
range = (cell) =>
  cell.innerText.split("-").map((addr) => parseInt(addr.slice(1), 16));
yesNoBool = (cell) => (cell.innerText.toLowerCase() === "yes" ? true : false);
cycles = (cell) => cell.innerText.split("/").map((num) => parseInt(num, 10));
instruction = (cell, x, row) => {
  const mnemonic = str(row[x + 1]);
  console.log(y, x, cell.innerText, mnemonic);

  switch (mnemonic) {
    case "J":
      return "Unconditional Jump";
    case "JE":
      return "Jump and Enable Interrupts";
    case "JD":
      return "Jump and Disable Interrupts";
    case "JSR":
      return "Jump to Subroutine";
    case "JSRE":
      return "Jump to Subroutine and Enable Interrupts";
    case "JSRD":
      return "Jump to Subroutine and Disable Interrupts";

    case "B":
      return "Unconditional Branch";
    case "BC":
      return "Branch on Carry";
    case "BOV":
      return "Branch on Overflow";
    case "BPL":
      return "Branch on Plus";
    case "BEQ":
      return "Branch If Equal / Branch On Zero";
    case "BLT":
      return "Branch if Less Than / Branch if Not Greater or Equal";
    case "BLE":
      return "Branch if Less Than or Equal / Branch if Not Greater Than";
    case "BUSC":
      return "Branch on Unequal Sign and Carry";
    case "NOPP":
      return "No Operation";
    case "BNC":
      return "Branch on No Carry";
    case "BNOV":
      return "Branch on No Overflow";
    case "BMI":
      return "Branch on Minus";
    case "BNEQ":
      return "Branch If Not Equal / Branch If Not Zero";
    case "BGE":
      return "Branch if Greater Than or Equal / Branch if Not Less Than";
    case "BGT":
      return "Branch if Greater Than / Branch if Not Less Than or Equal";
    case "BESC":
      return "Branch on Equal Sign and Carry";
    case "BEXT":
      return "Branch on External";
  }

  return cell.innerText;
};
columns = [
  {name: "range", parse: range},
  {name: "instruction", parse: instruction},
  {name: "mnemonic", parse: str},
  {name: "cycles", parse: cycles},
  {
    name: "interruptible",
    parse: yesNoBool,
  },
  {name: "in_s", parse: onlyTrue},
  {name: "in_z", parse: onlyTrue},
  {name: "in_o", parse: onlyTrue},
  {name: "in_c", parse: onlyTrue},
  {name: "in_d", parse: onlyTrue},
  {name: "out_s", parse: onlyTrue},
  {name: "out_z", parse: onlyTrue},
  {name: "out_o", parse: onlyTrue},
  {name: "out_c", parse: onlyTrue},
  {name: "out_i", parse: onlyTrue},
  {name: "out_d", parse: onlyTrue},
];

matrix = [];
y = 0;
for (const row of $0.rows) {
  for (const cell of row.cells) {
    x = 0;
    for (let yOffset = 0; yOffset < cell.rowSpan; ++yOffset) {
      matrix[y + yOffset] ??= [];
      const xPush = matrix[y + yOffset].length;
      for (let xOffset = 0; xOffset < cell.colSpan; ++xOffset) {
        matrix[y + yOffset][x + xOffset + xPush] = cell;
      }
    }
    ++x;
  }
  ++y;
}

result = [];
// Skip headers
for (const row of matrix.slice(2)) {
  const item = {};
  for (let x = 0; x < row.length; ++x) {
    const columnConfig = columns[x];
    item[columnConfig.name] = columnConfig.parse(row[x], x, row);
  }
  result.push(item);
}

console.log(JSON.stringify(result));
