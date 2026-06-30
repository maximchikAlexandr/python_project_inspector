import { map, unique } from "remeda";

import type { FileSnapshot } from "../api/client";
import { LINE_CATEGORIES } from "../registry/odooProfile";
import { formatCodeLines, formatStatsLine } from "../utils/metricFormat";

const FOLDER_COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7"];

function categoryLabel(category: string): string {
  return LINE_CATEGORIES.find(({ key }) => key === category)?.label ?? category;
}

export function fileTooltip(file: FileSnapshot): string {
  const parts = [
    `${file.module_name}/${file.relative_path}`,
    `lines=${formatCodeLines(file.lines)}`,
    categoryLabel(file.category),
    `CC ${formatStatsLine(file.cyclomatic)}`,
    `cognitive ${formatStatsLine(file.cognitive)}`,
    `Jones ${formatStatsLine(file.jones)}`,
  ];
  if (file.parse_error) {
    parts.push(`parse_error=${file.parse_error}`);
  }
  return parts.join(" | ");
}

export function folderColor(topFolder: string): string {
  let hash = 0;
  for (let index = 0; index < topFolder.length; index += 1) {
    hash = topFolder.charCodeAt(index) + ((hash << 5) - hash);
  }
  return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length];
}

export function truncateTreemapText(text: string, maxChars: number): string | null {
  if (maxChars < 3) {
    return null;
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export const TREEMAP_MIN_TEXT_WIDTH = 60;
export const TREEMAP_MIN_TEXT_HEIGHT = 28;

type TreemapRoot = { children: FileSnapshot[] };

export function isFileSnapshot(value: TreemapRoot | FileSnapshot): value is FileSnapshot {
  return "relative_path" in value;
}

export function treemapLegendFolders(files: ReadonlyArray<FileSnapshot>): string[] {
  return unique(map(files, (file) => file.top_folder));
}
