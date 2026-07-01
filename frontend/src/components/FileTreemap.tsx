import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { useEffect, useMemo, useRef, useState } from "react";

import { compactLines } from "../utils/metricFormat";
import {
  fileTooltip,
  folderColor,
  TREEMAP_MIN_TEXT_HEIGHT,
  TREEMAP_MIN_TEXT_WIDTH,
  truncateTreemapText,
  treemapLegendFolders,
} from "../transforms/treemapTransforms";

export type TreemapFile = {
  module_name: string;
  relative_path: string;
  line_category_id: string;
  lines: number;
  top_folder: string;
  metrics: Record<string, number>;
  distributions: Record<string, { median: number; mean: number; count: number; p95: number; max: number }>;
};

type Props = {
  readonly files: readonly TreemapFile[];
  readonly lineCategories: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly onSelect: (file: TreemapFile | null) => void;
  readonly onHover?: (file: TreemapFile | null) => void;
};

type TreemapRoot = { children: TreemapFile[] };

type TreemapLeaf = {
  file: TreemapFile;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

function isTreemapFile(value: TreemapRoot | TreemapFile): value is TreemapFile {
  return "relative_path" in value;
}

export function FileTreemap({ files, lineCategories, selectedPath, onSelect, onHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 860, height: 560 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      setSize({ width, height: 560 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(
    () => files.filter((file) => lineCategories.size > 0 && lineCategories.has(file.line_category_id)),
    [files, lineCategories],
  );

  const layout = useMemo(() => {
    if (!filtered.length) return [] as TreemapLeaf[];
    const root = hierarchy<TreemapRoot | TreemapFile>({ children: filtered })
      .sum((node) => (isTreemapFile(node) ? node.lines : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<TreemapRoot | TreemapFile>()
      .tile(treemapSquarify)
      .size([size.width, size.height])
      .padding(2)(root)
      .leaves()
      .flatMap((leaf) => {
        if (!isTreemapFile(leaf.data)) return [];
        return [{ file: leaf.data, x0: leaf.x0, x1: leaf.x1, y0: leaf.y0, y1: leaf.y1 }];
      });
  }, [filtered, size.height, size.width]);

  const legend = treemapLegendFolders(filtered);

  if (!filtered.length) {
    return (
      <div ref={containerRef} style={{ padding: 24, color: "#868e96" }}>
        No files for the selected line categories.
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        {legend.map((folder) => (
          <span key={folder} style={{ fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 12, height: 12, background: folderColor(folder), marginRight: 4 }} />
            {folder}
          </span>
        ))}
      </div>
      <svg
        width="100%"
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ border: "1px solid var(--mantine-color-gray-3)", background: "#fbfcfd", display: "block" }}
      >
        {layout.map((leaf) => {
          const file = leaf.file;
          const pathKey = `${file.module_name}/${file.relative_path}`;
          const selected = selectedPath === pathKey;
          const innerW = leaf.x1 - leaf.x0;
          const innerH = leaf.y1 - leaf.y0;
          const centerX = leaf.x0 + innerW / 2;
          const centerY = leaf.y0 + innerH / 2;
          const maxChars = Math.floor((innerW - 6) / 6.8);
          const basename = file.relative_path.split("/").pop() ?? file.relative_path;
          const displayName = truncateTreemapText(basename, maxChars);
          const displayLines = truncateTreemapText(compactLines(file.lines), maxChars);
          return (
            <g
              key={pathKey}
              transform={`translate(${leaf.x0}, ${leaf.y0})`}
              onClick={() => onSelect(file)}
              onMouseEnter={() => onHover?.(file)}
              onMouseLeave={() => onHover?.(null)}
              style={{ cursor: "pointer" }}
            >
              <title>{fileTooltip(file)}</title>
              <rect
                width={innerW}
                height={innerH}
                fill={folderColor(file.top_folder)}
                stroke={selected ? "#228be6" : "#fff"}
                strokeWidth={selected ? 2 : 1}
              />
              {innerW >= TREEMAP_MIN_TEXT_WIDTH && innerH >= TREEMAP_MIN_TEXT_HEIGHT ? (
                <>
                  {displayName ? (
                    <text x={centerX - leaf.x0} y={displayLines ? centerY - leaf.y0 - 2 : centerY - leaf.y0 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#ffffff" pointerEvents="none">
                      {displayName}
                    </text>
                  ) : null}
                  {displayLines ? (
                    <text x={centerX - leaf.x0} y={displayName ? centerY - leaf.y0 + 14 : centerY - leaf.y0 + 4} textAnchor="middle" fontSize={12} fill="#ffffff" pointerEvents="none">
                      {displayLines}
                    </text>
                  ) : null}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}