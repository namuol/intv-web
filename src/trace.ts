let totalLogs = 0;
export const trace = (..._: any[]) => {
  if (totalLogs < 359) {
    console.error(..._);
    totalLogs += 1;
  }
};
