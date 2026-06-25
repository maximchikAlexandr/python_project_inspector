/**
 * Pure view-model builders for table components (PPI-028).
 *
 * Sorting/filtering lives here so the JSX component becomes a render adapter:
 * props are readonly, derived rows are produced by these pure helpers.
 */

import type { FileSnapshot, ModuleSnapshot } from "../api/client";

/** Sort modules by descending total lines, then by name for a stable order. */
export function sortModuleLinesRows(
  modules: ReadonlyArray<ModuleSnapshot>,
  filter: string,
): readonly ModuleSnapshot[] {
  return [...modules]
    .filter((module) => module.module_name.includes(filter))
    .sort(
      (left, right) =>
        right.total_lines - left.total_lines || left.module_name.localeCompare(right.module_name),
    );
}

/** Filter file rows by module/path substring. */
export function filterFileRows(
  files: ReadonlyArray<FileSnapshot>,
  moduleFilter: string,
  pathFilter: string,
): readonly FileSnapshot[] {
  return files.filter(
    (file) => file.module_name.includes(moduleFilter) && file.relative_path.includes(pathFilter),
  );
}