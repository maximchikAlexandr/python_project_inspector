import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { useMemo } from "react";

import type { FileSnapshot } from "../api/client";
import { type LineCategoryKey } from "../registry/odooProfile";

type Props = {
  files: FileSnapshot[];
  lineCategories: Set<LineCategoryKey>;
  selectedPath: string | null;
  onSelect: (file: FileSnapshot | null) => void;
};

type TreemapRoot = {
  children: FileSnapshot[];
};

type TreemapLeaf = {
  file: FileSnapshot;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

const FOLDER_COLORS = ["#4dabf7", "#69db7c", "#ffd43b", "#ffa8a8", "#da77f2", "#868e96"];

function folderColor(topFolder: string): string {
  let hash = 0;
  for (let index = 0; index < topFolder.length; index += 1) {
    hash = topFolder.charCodeAt(index) + ((hash << 5) - hash);
  }
  return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length];
}

function isFileSnapshot(value: TreemapRoot | FileSnapshot): value is FileSnapshot {
  return "relative_path" in value;
}

export function FileTreemap({ files, lineCategories, selectedPath, onSelect }: Props) {
  const filtered = useMemo(
    () =>
      files.filter((file) => {
        if (!lineCategories.size) {
          return true;
        }
        return lineCategories.has(file.category as LineCategoryKey);
      }),
    [files, lineCategories],
  );

  const layout = useMemo(() => {
    if (!filtered.length) {
      return [] as TreemapLeaf[];
    }
    const root = hierarchy<TreemapRoot | FileSnapshot>({ children: filtered })
      .sum((node) => (isFileSnapshot(node) ? node.lines : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<TreemapRoot | FileSnapshot>()
      .tile(treemapSquarify)
      .size([860, 360])
      .padding(2)(root)
      .leaves()
      .flatMap((leaf) => {
        if (!isFileSnapshot(leaf.data)) {
          return [];
        }
        return [{
          file: leaf.data,
          x0: leaf.x0,
          x1: leaf.x1,
          y0: leaf.y0,
          y1: leaf.y1,
        }];
      });
  }, [filtered]);

  if (!filtered.length) {
    return <div style={{ padding: 24, color: "#868e96" }}>No files for the selected line categories.</div>;
  }

  const legend = [...new Set(filtered.map((file) => file.top_folder))];

  return (
    <div>
      <svg width="100%" viewBox="0 0 860 360" style={{ border: "1px solid var(--mantine-color-gray-3)" }}>
        {layout.map((leaf) => {
          const file = leaf.file;
          const pathKey = `${file.module_name}/${file.relative_path}`;
          const selected = selectedPath === pathKey;
          return (
            <g
              key={pathKey}
              transform={`translate(${leaf.x0}, ${leaf.y0})`}
              onClick={() => onSelect(file)}
              style={{ cursor: "pointer" }}
            >
              <rect
                width={leaf.x1 - leaf.x0}
                height={leaf.y1 - leaf.y0}
                fill={folderColor(file.top_folder)}
                stroke={selected ? "#228be6" : "#fff"}
                strokeWidth={selected ? 2 : 1}
              />
              {(leaf.x1 - leaf.x0) > 60 && (leaf.y1 - leaf.y0) > 24 ? (
                <text x={4} y={14} fontSize={10} fill="#212529">
                  {file.relative_path.split("/").pop()}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {legend.map((folder) => (
          <span key={folder} style={{ fontSize: 12 }}>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: folderColor(folder),
                marginRight: 4,
              }}
            />
            {folder}
          </span>
        ))}
      </div>
    </div>
  );
}
