export function formatCodeLines(value: number): string {
  return Number(value || 0).toLocaleString("en-US");
}

export function compactLines(value: number): string {
  const number = Number(value || 0);
  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(number);
}

export function formatMetricValue(value: number): string {
  const number = Number(value || 0);
  if (Number.isInteger(number)) {
    return String(number);
  }
  return number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
