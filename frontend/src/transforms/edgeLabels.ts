export function readableEdgeLabel(key: string, configuredLabel?: string | null): string {
  if (configuredLabel && configuredLabel.trim()) {
    return configuredLabel;
  }
  return generateReadableFallback(key);
}

export function generateReadableFallback(key: string): string {
  return key
    .replace(/[_\-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}
