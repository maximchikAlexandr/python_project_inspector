import { map, unique } from "remeda";

import { formatCodeLines } from "../utils/metricFormat";
import type { TreemapFile } from "../components/FileTreemap";

const FOLDER_COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7"];

export function folderColor(topFolder: string): string {
  let hash = 0;
  for (let index = 0; index < topFolder.length; index += 1) {
    hash = topFolder.charCodeAt(index) + ((hash << 5) - hash);
  }
  return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length];
}

export function truncateTreemapText(text: string, maxChars: number): string | null {
  if (maxChars < 3) return null;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export const TREEMAP_MIN_TEXT_WIDTH = 60;
export const TREEMAP_MIN_TEXT_HEIGHT = 28;

export function treemapLegendFolders(files: ReadonlyArray<TreemapFile>): string[] {
  return unique(map(files, (f) => f.top_folder).filter((folder) => folder !== "."));
}

export function fileTooltip(file: TreemapFile): string {
  const parts = [
    `${file.module_name}/${file.relative_path}`,
    `lines=${formatCodeLines(file.lines)}`,
    file.line_category_id,
  ];
  const cyclomatic = file.distributions?.cyclomatic;
  if (cyclomatic) parts.push(`CC median=${cyclomatic.median}`);
  return parts.join(" | ");
}