import {
  Accordion,
  ActionIcon,
  Button,
  Drawer,
  Group,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { useEffect, useState } from "react";

import type { CommitRow } from "../api/client";
import { t } from "../i18n";

import { GraphLegend } from "./GraphLegend";
import type { GraphStats } from "./graphSelectors";
import type {
  GraphDisplayState,
  GraphFilterState,
  GraphForceState,
  GraphSectionKey,
  GraphSettings,
} from "./graphSettingsTypes";

export type LayoutCommandKind = "restart" | "reset" | "save" | "load" | "unpinAll";
export type ZoomCommandKind = "in" | "out" | "fit";
export type TimelapseAction =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "prev" }
  | { kind: "next" }
  | { kind: "speed"; speed: number };

type Props = {
  readonly settings: GraphSettings;
  readonly onFilterChange: (patch: Partial<GraphFilterState>) => void;
  readonly onDisplayChange: (patch: Partial<GraphDisplayState>) => void;
  readonly onForceChange: (patch: Partial<GraphForceState>) => void;
  readonly onSectionsExpandedChange: (patch: Partial<Record<GraphSectionKey, boolean>>) => void;
  readonly onResetForces: () => void;
  readonly onResetAll: () => void;
  readonly onZoom: (kind: ZoomCommandKind) => void;
  readonly onLayout: (kind: LayoutCommandKind) => void;
  readonly onClearFocus: () => void;
  readonly onPinSelected: () => void;
  readonly stats: GraphStats;
  readonly edgeKindMeta: ReadonlyArray<{ key: string; label: string; color: string }>;
  readonly maxEffectiveScore: number;
  readonly selectedModule: string | null;
  readonly commits: readonly CommitRow[];
  readonly selectedCommit: string | null;
  readonly commitPositionLabel: string;
  readonly timelapse: { readonly playing: boolean; readonly speed: number };
  readonly onTimelapse: (action: TimelapseAction) => void;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly saveNotice: string | null;
};

const SECTION_KEYS: GraphSectionKey[] = ["filters", "display", "forces", "focus", "stats"];

function sectionValue(expanded: Record<GraphSectionKey, boolean>): string[] {
  return SECTION_KEYS.filter((key) => expanded[key]);
}

function expandedFromAccordion(value: string | string[]): Record<GraphSectionKey, boolean> {
  const open = Array.isArray(value) ? value : value ? [value] : [];
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, open.includes(key)])) as Record<
    GraphSectionKey,
    boolean
  >;
}

function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const handler = () => setNarrow(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);
  return narrow;
}

function PanelBody({
  settings,
  onFilterChange,
  onDisplayChange,
  onForceChange,
  onSectionsExpandedChange,
  onResetForces,
  onZoom,
  onLayout,
  onClearFocus,
  onPinSelected,
  stats,
  edgeKindMeta,
  maxEffectiveScore,
  selectedModule,
  selectedCommit,
  commits,
  commitPositionLabel,
  timelapse,
  onTimelapse,
  saveNotice,
}: Omit<Props, "collapsed" | "onToggleCollapsed" | "onResetAll">) {
  const singleCommit = commits.length < 2;
  const commitIndex = selectedCommit
    ? commits.findIndex((row) => row.commit_hash === selectedCommit)
    : -1;
  const atFirstCommit = commitIndex <= 0;
  const atLastCommit = commitIndex < 0 || commitIndex >= commits.length - 1;

  return (
    <Stack gap="sm">
      {saveNotice ? (
        <Text size="xs" c="orange">
          {saveNotice}
        </Text>
      ) : null}
      <Accordion
        multiple
        variant="contained"
        value={sectionValue(settings.sectionsExpanded)}
        onChange={(value) => onSectionsExpandedChange(expandedFromAccordion(value))}
      >
        <Accordion.Item value="filters">
          <Accordion.Control>{t("graph.settings.sections.filters", "Filters")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              {edgeKindMeta.map(({ key, label }) => (
                <Switch
                  key={key}
                  label={label}
                  checked={settings.filter.enabledEdgeKinds[key]}
                  onChange={(event) =>
                    onFilterChange({
                      enabledEdgeKinds: {
                        ...settings.filter.enabledEdgeKinds,
                        [key]: event.currentTarget.checked,
                      },
                    })
                  }
                />
              ))}
              <Text size="xs">
                {t("graph.settings.minEdgePoints", "Minimum edge points: {{value}}", {
                  value: settings.filter.minEdgeScore,
                })}
              </Text>
              <Slider
                aria-label={t("graph.settings.minEdgePointsLabel", "Minimum edge points")}
                min={0}
                max={Math.max(maxEffectiveScore, 0)}
                step={1}
                disabled={maxEffectiveScore === 0}
                value={settings.filter.minEdgeScore}
                onChange={(value) => onFilterChange({ minEdgeScore: value })}
              />
              <Switch
                label={t("graph.settings.includeZeroScoreEdges", "Include zero-score edges")}
                checked={settings.filter.includeZeroScore}
                onChange={(event) => onFilterChange({ includeZeroScore: event.currentTarget.checked })}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="display">
          <Accordion.Control>{t("graph.settings.sections.display", "Display")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Switch
                label={t("graph.settings.directionalArrows", "Directional arrows")}
                checked={settings.display.showArrows}
                onChange={(event) => onDisplayChange({ showArrows: event.currentTarget.checked })}
              />
              <Text size="xs">{t("graph.settings.labelMode", "Label mode")}</Text>
              <SegmentedControl
                size="xs"
                aria-label={t("graph.settings.labelMode", "Label mode")}
                value={settings.display.labelMode}
                onChange={(value) =>
                  onDisplayChange({ labelMode: value as GraphDisplayState["labelMode"] })
                }
                data={[
                  { label: t("graph.settings.labelMode.always", "Always"), value: "always" },
                  { label: t("graph.settings.labelMode.hover", "Hover"), value: "hover" },
                  { label: t("graph.settings.labelMode.selected", "Selected"), value: "selected" },
                  { label: t("graph.settings.labelMode.none", "None"), value: "none" },
                ]}
              />
              <Text size="xs">
                {t("graph.settings.labelFadeThreshold", "Label fade threshold: {{value}}", {
                  value: settings.display.labelFadeThreshold.toFixed(1),
                })}
              </Text>
              <Slider
                aria-label={t("graph.settings.labelFadeThresholdLabel", "Label fade threshold")}
                min={0}
                max={2}
                step={0.1}
                value={settings.display.labelFadeThreshold}
                onChange={(value) => onDisplayChange({ labelFadeThreshold: value })}
              />
              <Text size="xs">{t("graph.settings.nodeSizeMetric", "Node size metric")}</Text>
              <SegmentedControl
                size="xs"
                aria-label={t("graph.settings.nodeSizeMetric", "Node size metric")}
                value={settings.display.nodeSizeMetric}
                onChange={(value) =>
                  onDisplayChange({ nodeSizeMetric: value as GraphDisplayState["nodeSizeMetric"] })
                }
                data={[
                  { label: t("graph.settings.metric.visible", "Visible"), value: "visible_lines" },
                  { label: t("graph.settings.metric.total", "Total"), value: "total_lines" },
                  { label: t("graph.settings.metric.methods", "Methods"), value: "method_count" },
                  { label: "IN", value: "score_in" },
                  { label: "OUT", value: "score_out" },
                  { label: t("graph.settings.metric.fixed", "Fixed"), value: "fixed" },
                ]}
              />
              <Text size="xs">
                {t("graph.settings.nodeSizeScale", "Node size scale: {{value}}", {
                  value: settings.display.nodeSizeScale.toFixed(1),
                })}
              </Text>
              <Slider
                aria-label={t("graph.settings.nodeSizeScaleLabel", "Node size scale")}
                min={0.5}
                max={2}
                step={0.1}
                value={settings.display.nodeSizeScale}
                onChange={(value) => onDisplayChange({ nodeSizeScale: value })}
              />
              <Text size="xs">{t("graph.settings.linkThicknessMetric", "Link thickness metric")}</Text>
              <SegmentedControl
                size="xs"
                aria-label={t("graph.settings.linkThicknessMetric", "Link thickness metric")}
                value={settings.display.linkThicknessMetric}
                onChange={(value) =>
                  onDisplayChange({
                    linkThicknessMetric: value as GraphDisplayState["linkThicknessMetric"],
                  })
                }
                data={[
                  { label: t("graph.settings.metric.total", "Total"), value: "total_points" },
                  { label: t("graph.settings.metric.kinds", "Kinds"), value: "selected_kind_points" },
                  { label: t("graph.settings.metric.score", "Score"), value: "score" },
                  { label: t("graph.settings.metric.fixed", "Fixed"), value: "fixed" },
                ]}
              />
              <Text size="xs">
                {t("graph.settings.linkThicknessScale", "Link thickness scale: {{value}}", {
                  value: settings.display.linkThicknessScale.toFixed(1),
                })}
              </Text>
              <Slider
                aria-label={t("graph.settings.linkThicknessScaleLabel", "Link thickness scale")}
                min={0.5}
                max={2}
                step={0.1}
                value={settings.display.linkThicknessScale}
                onChange={(value) => onDisplayChange({ linkThicknessScale: value })}
              />
              <Switch
                label={t("graph.settings.fadeNonNeighbors", "Fade non-neighbors on hover")}
                checked={settings.display.fadeNonNeighbors}
                onChange={(event) => onDisplayChange({ fadeNonNeighbors: event.currentTarget.checked })}
              />
              <Switch
                label={t("graph.settings.edgeLabels", "Edge labels")}
                checked={settings.display.showEdgeLabels}
                onChange={(event) => onDisplayChange({ showEdgeLabels: event.currentTarget.checked })}
              />
              <Switch
                label={t("graph.settings.nodeBadges", "Node badges")}
                checked={settings.display.showNodeBadges}
                onChange={(event) => onDisplayChange({ showNodeBadges: event.currentTarget.checked })}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="forces">
          <Accordion.Control>{t("graph.settings.sections.forces", "Forces")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="xs">
                {t("graph.settings.centerStrength", "Center strength: {{value}}", {
                  value: settings.force.centerStrength.toFixed(2),
                })}
              </Text>
                <Slider
                  aria-label={t("graph.settings.centerStrengthLabel", "Center strength")}
                  min={0}
                  max={0.3}
                  step={0.01}
                  value={settings.force.centerStrength}
                  onChange={(value) => onForceChange({ centerStrength: value })}
                />
                <Text size="xs">
                  {t("graph.settings.repelStrength", "Repel strength: {{value}}", {
                    value: settings.force.repelStrength,
                  })}
                </Text>
                <Slider
                  aria-label={t("graph.settings.repelStrengthLabel", "Repel strength")}
                  min={-2000}
                  max={-100}
                  step={50}
                  value={settings.force.repelStrength}
                  onChange={(value) => onForceChange({ repelStrength: value })}
                />
                <Text size="xs">
                  {t("graph.settings.linkStrengthBase", "Link strength base: {{value}}", {
                    value: settings.force.linkStrength.toFixed(2),
                  })}
                </Text>
                <Slider
                  aria-label={t("graph.settings.linkStrengthLabel", "Link strength")}
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={settings.force.linkStrength}
                  onChange={(value) => onForceChange({ linkStrength: value })}
                />
                <Text size="xs">
                  {t("graph.settings.linkDistanceBase", "Link distance base: {{value}}", {
                    value: settings.force.linkDistance,
                  })}
                </Text>
                <Slider
                  aria-label={t("graph.settings.linkDistanceLabel", "Link distance")}
                  min={80}
                  max={400}
                  step={10}
                  value={settings.force.linkDistance}
                  onChange={(value) => onForceChange({ linkDistance: value })}
                />
                <Text size="xs">
                  {t("graph.settings.collisionPadding", "Collision padding: {{value}}", {
                    value: settings.force.collidePadding,
                  })}
                </Text>
                <Slider
                  aria-label={t("graph.settings.collisionPaddingLabel", "Collision padding")}
                  min={0}
                  max={20}
                  step={1}
                  value={settings.force.collidePadding}
                  onChange={(value) => onForceChange({ collidePadding: value })}
                />
                <Text size="xs">
                  {t("graph.settings.velocityDecay", "Velocity decay: {{value}}", {
                    value: settings.force.velocityDecay.toFixed(2),
                  })}
                </Text>
                <Slider
                  aria-label={t("graph.settings.velocityDecayLabel", "Velocity decay")}
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={settings.force.velocityDecay}
                  onChange={(value) => onForceChange({ velocityDecay: value })}
                />
                <Group gap="xs">
                  <Button size="xs" variant="light" onClick={() => onLayout("restart")}>
                    {t("graph.settings.restartLayout", "Restart layout")}
                  </Button>
                  <Button size="xs" variant="light" onClick={onResetForces}>
                    {t("graph.settings.resetForces", "Reset forces")}
                  </Button>
                </Group>
                <Group gap="xs">
                  <Button size="xs" variant="light" onClick={() => onLayout("save")}>
                    {t("graph.settings.saveLayout", "Save layout")}
                  </Button>
                  <Button size="xs" variant="light" onClick={() => onLayout("load")}>
                    {t("graph.settings.loadLayout", "Load layout")}
                  </Button>
                  <Button size="xs" variant="light" onClick={() => onLayout("reset")}>
                    {t("graph.settings.resetLayout", "Reset layout")}
                  </Button>
                  <Button size="xs" variant="light" onClick={() => onLayout("unpinAll")}>
                    {t("graph.settings.unpinAll", "Unpin all")}
                  </Button>
                </Group>
              </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="focus">
          <Accordion.Control>{t("graph.settings.sections.focus", "Focus")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Switch
                  label={t("graph.settings.focusSelectedModule", "Focus selected module")}
                  checked={settings.filter.focusEnabled}
                  onChange={(event) => onFilterChange({ focusEnabled: event.currentTarget.checked })}
                />
                <Text size="xs">
                  {t("graph.settings.depth", "Depth: {{value}}", { value: settings.filter.localDepth })}
                </Text>
                <Slider
                  aria-label={t("graph.settings.focusDepthLabel", "Focus depth")}
                  min={1}
                  max={5}
                  step={1}
                  value={settings.filter.localDepth}
                  onChange={(value) => onFilterChange({ localDepth: value })}
                />
                <Text size="xs">{t("graph.settings.direction", "Direction")}</Text>
                <SegmentedControl
                  size="xs"
                  aria-label={t("graph.settings.focusDirectionLabel", "Focus direction")}
                  value={settings.filter.directionMode}
                  onChange={(value) =>
                    onFilterChange({ directionMode: value as GraphFilterState["directionMode"] })
                  }
                  data={[
                    { label: t("graph.settings.direction.both", "Both"), value: "both" },
                    { label: t("graph.settings.direction.in", "In"), value: "incoming" },
                    { label: t("graph.settings.direction.out", "Out"), value: "outgoing" },
                  ]}
                />
                <Group gap="xs">
                  <Button size="xs" variant="light" onClick={onClearFocus}>
                    {t("graph.settings.clearFocus", "Clear focus")}
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={onPinSelected}
                    disabled={!selectedModule}
                    aria-label={t("graph.settings.pinSelectedLabel", "Pin or unpin selected module")}
                  >
                    {t("graph.settings.pinSelected", "Pin/unpin selected")}
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                {t("graph.settings.subject", "Subject: {{value}}", {
                  value: settings.filter.focusModule ?? selectedModule ?? t("graph.settings.none", "none"),
                })}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="stats">
          <Accordion.Control>{t("graph.settings.sections.stats", "Stats")}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap={4}>
              <Text size="xs">
                {t("graph.settings.visibleNodes", "Visible nodes: {{visible}} / {{total}}", {
                  visible: stats.visibleNodes,
                  total: stats.totalNodes,
                })}
              </Text>
              <Text size="xs">
                {t("graph.settings.visibleEdges", "Visible edges: {{visible}} / {{total}}", {
                  visible: stats.visibleEdges,
                  total: stats.totalEdges,
                })}
              </Text>
              <Text size="xs">
                {t("graph.settings.hiddenByFilters", "Hidden by filters: {{value}}", {
                  value: stats.hiddenByFilters,
                })}
              </Text>
              <Text size="xs">
                {t("graph.settings.selected", "Selected: {{value}}", {
                  value: stats.selectedModule ?? t("graph.settings.none", "none"),
                })}
              </Text>
              <Text size="xs">
                {t("graph.settings.focusState", "Focus: {{enabled}} · depth {{depth}} · {{direction}}", {
                  enabled: stats.focusState.enabled ? t("graph.settings.on", "on") : t("graph.settings.off", "off"),
                  depth: stats.focusState.depth,
                  direction: stats.focusState.direction,
                })}
              </Text>
              <GraphLegend
                nodeSizeMetric={settings.display.nodeSizeMetric}
                linkThicknessMetric={settings.display.linkThicknessMetric}
                edgeKindMeta={edgeKindMeta}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Stack gap="xs">
        <Text size="xs" fw={600}>
          {t("graph.settings.zoom", "Zoom")}
        </Text>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => onZoom("in")} aria-label={t("graph.settings.zoomIn", "Zoom in")}>
            {t("graph.settings.zoom.in", "In")}
          </Button>
          <Button size="xs" variant="light" onClick={() => onZoom("out")} aria-label={t("graph.settings.zoomOut", "Zoom out")}>
            {t("graph.settings.zoom.out", "Out")}
          </Button>
          <Button size="xs" variant="light" onClick={() => onZoom("fit")} aria-label={t("graph.settings.fitToView", "Fit to view")}>
            {t("graph.settings.zoom.fit", "Fit")}
          </Button>
        </Group>
      </Stack>
      <Stack gap="xs">
        <Text size="xs" fw={600}>
          {t("graph.settings.timelapse", "Time-lapse")}
        </Text>
        <Text size="xs" c="dimmed">
          {commitPositionLabel}
        </Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            disabled={singleCommit}
            onClick={() => onTimelapse({ kind: timelapse.playing ? "pause" : "play" })}
          >
            {timelapse.playing ? t("graph.settings.pause", "Pause") : t("graph.settings.play", "Play")}
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={singleCommit || atFirstCommit}
            onClick={() => onTimelapse({ kind: "prev" })}
          >
            {t("graph.settings.prev", "Prev")}
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={singleCommit || atLastCommit}
            onClick={() => onTimelapse({ kind: "next" })}
          >
            {t("graph.settings.next", "Next")}
          </Button>
          <Text size="xs">{t("graph.settings.speed", "Speed")}</Text>
          <SegmentedControl
            size="xs"
            aria-label={t("graph.settings.timelapseSpeed", "Time-lapse speed")}
            value={String(timelapse.speed)}
            onChange={(value) => onTimelapse({ kind: "speed", speed: Number(value) })}
            data={[
              { label: "0.5×", value: "2000" },
              { label: "1×", value: "1000" },
              { label: "2×", value: "500" },
            ]}
          />
        </Group>
        {singleCommit ? (
          <Text size="xs" c="dimmed">
            {t("graph.settings.timelapseNeedsTwoCommits", "Time-lapse needs at least two commits.")}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}

export function GraphSettingsPanel(props: Props) {
  const narrow = useNarrowLayout();
  const {
    collapsed,
    onToggleCollapsed,
    onResetAll,
    onSectionsExpandedChange,
    settings,
    edgeKindMeta,
    maxEffectiveScore,
    ...bodyProps
  } = props;

  const inner = (
    <PanelBody
      {...bodyProps}
      settings={settings}
      edgeKindMeta={edgeKindMeta}
      maxEffectiveScore={maxEffectiveScore}
      onSectionsExpandedChange={onSectionsExpandedChange}
    />
  );

  if (narrow) {
    return (
      <>
        <Tooltip label={t("graph.settings.title", "Graph settings")}>
          <ActionIcon
            size="lg"
            variant="light"
            onClick={onToggleCollapsed}
            aria-label={t("graph.settings.title", "Graph settings")}
            style={{ minWidth: 32, minHeight: 32 }}
          >
            ⚙
          </ActionIcon>
        </Tooltip>
        <Drawer
          opened={!collapsed}
          onClose={onToggleCollapsed}
          title={
            <Group justify="space-between" wrap="nowrap" w="100%">
              <Text fw={600} size="sm">
                {t("graph.settings.title", "Graph settings")}
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={onResetAll} aria-label={t("graph.settings.resetAllLabel", "Reset all settings to defaults")}>
                {t("graph.settings.reset", "Reset")}
              </Button>
            </Group>
          }
          position="right"
          size={320}
        >
          {inner}
        </Drawer>
      </>
    );
  }

  if (collapsed) {
    return (
      <Tooltip label={t("graph.settings.title", "Graph settings")}>
        <ActionIcon
          size="lg"
          variant="light"
          onClick={onToggleCollapsed}
          aria-label={t("graph.settings.title", "Graph settings")}
          style={{ minWidth: 32, minHeight: 32 }}
        >
          ⚙
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Paper withBorder radius="md" p="sm" w={320} style={{ flexShrink: 0, maxHeight: "calc(100vh - 120px)", overflow: "auto" }}>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600} size="sm">
          {t("graph.settings.title", "Graph settings")}
        </Text>
        <Group gap={4}>
          <Button size="compact-xs" variant="subtle" onClick={onResetAll} aria-label={t("graph.settings.resetAllLabel", "Reset all settings to defaults")}>
            {t("graph.settings.reset", "Reset")}
          </Button>
          <ActionIcon variant="subtle" onClick={onToggleCollapsed} aria-label={t("graph.settings.collapsePanel", "Collapse graph settings panel")}>
            ✕
          </ActionIcon>
        </Group>
      </Group>
      {inner}
    </Paper>
  );
}
