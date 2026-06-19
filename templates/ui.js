import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import {
  Accordion,
  Badge,
  Card,
  Checkbox,
  Code,
  Group,
  MantineProvider,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  createTheme,
} from "https://esm.sh/@mantine/core@8.3.14?bundle&deps=react@18.2.0,react-dom@18.2.0";

const reportData = window.__PYTHON_PROJECT_INSPECTOR_DATA__ || {};
const actions = window.__PYTHON_PROJECT_INSPECTOR_ACTIONS__ || {};
const lineCategories = reportData.line_categories || [];
const brightnessCriteria = [
  { key: "cyclomatic_median", label: "Cyclomatic median" },
  { key: "cognitive_median", label: "Cognitive median" },
  { key: "jones_median", label: "Jones median" },
  { key: "method_count", label: "Method count" },
  { key: "total_lines", label: "Code lines" },
  { key: "python_file_count", label: "Python file count" },
];
const moduleOptions = (reportData.nodes || [])
  .map((node) => node.id)
  .sort((a, b) => a.localeCompare(b))
  .map((moduleName) => ({ value: moduleName, label: moduleName }));

const theme = createTheme({
  fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
  headings: {
    fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
  },
});

const h = React.createElement;

function formatCodeLines(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function formatMetricValue(value) {
  const n = Number(value || 0);
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatStatsLine(stats) {
  if (!stats || !stats.count) {
    return "-";
  }
  return [
    `avg ${formatMetricValue(stats.mean)}`,
    `med ${formatMetricValue(stats.median)}`,
    `P95 ${formatMetricValue(stats.p95)}`,
    `max ${formatMetricValue(stats.max)}`,
    `n=${stats.count}`,
  ].join(" · ");
}

function useReportState() {
  const [state, setState] = useState(() => ({
    selectedModuleId: null,
    selectedFilePath: null,
    selectedLineCategoryKeys: [],
    selectedBrightnessCriterionKeys: [],
    visibleLinesTotal: 0,
    ...(window.__PYTHON_PROJECT_INSPECTOR_STATE__ || {}),
  }));

  useEffect(() => {
    function handleStateChange(event) {
      setState({
        selectedModuleId: null,
        selectedFilePath: null,
        selectedLineCategoryKeys: [],
        selectedBrightnessCriterionKeys: [],
        visibleLinesTotal: 0,
        ...(window.__PYTHON_PROJECT_INSPECTOR_STATE__ || {}),
        ...(event.detail || {}),
      });
    }

    window.addEventListener("coupling-report-state", handleStateChange);
    return () => {
      window.removeEventListener("coupling-report-state", handleStateChange);
    };
  }, []);

  return state;
}

function withProvider(component) {
  return h(MantineProvider, { theme }, component);
}

function Panel({ title, children, subtitle }) {
  return h(
    Paper,
    { withBorder: true, radius: "md", p: "md", mb: "lg", shadow: "xs" },
    h(
      Stack,
      { gap: "sm" },
      h(Title, { order: 2, size: "h3" }, title),
      subtitle ? h(Text, { size: "sm", c: "dimmed" }, subtitle) : null,
      children,
    ),
  );
}

function StatsCard({ title, value, subtitle }) {
  return h(
    Card,
    { withBorder: true, radius: "md", padding: "md" },
    h(
      Stack,
      { gap: 4 },
      h(Text, { size: "xs", tt: "uppercase", fw: 700, c: "dimmed" }, title),
      h(Text, { size: "xl", fw: 800, c: "teal.8" }, value),
      h(Text, { size: "xs", c: "dimmed" }, subtitle || ""),
    ),
  );
}

function DistributionCard({ title, stats }) {
  return h(
    Card,
    { withBorder: true, radius: "md", padding: "md" },
    h(
      Stack,
      { gap: 4 },
      h(Text, { size: "sm", fw: 700 }, title),
      h(Text, { size: "sm" }, stats && stats.count ? `avg ${formatMetricValue(stats.mean)}` : "-"),
      h(Text, { size: "xs", c: "dimmed" }, formatStatsLine(stats)),
    ),
  );
}

function MetricText({ stats }) {
  return h(
    Stack,
    { gap: 0 },
    h(Text, { size: "xs" }, stats && stats.count ? `avg ${formatMetricValue(stats.mean)}` : "-"),
    h(Text, { size: "xs", c: "dimmed" }, formatStatsLine(stats)),
  );
}

function SummaryRoot() {
  const state = useReportState();
  const selectedLabels = lineCategories
    .filter((category) => (state.selectedLineCategoryKeys || []).includes(category.key))
    .map((category) => category.label);

  return h(
    SimpleGrid,
    { cols: { base: 1, sm: 1 }, spacing: "md" },
    h(StatsCard, {
      title: "Visible code lines",
      value: formatCodeLines(state.visibleLinesTotal),
      subtitle: selectedLabels.length ? `Selected categories: ${selectedLabels.join(", ")}` : "No line categories selected.",
    }),
  );
}

function CheckboxToolbarRoot({ label, options, value, onChange }) {
  return h(
    Paper,
    { withBorder: true, radius: "md", p: "sm", style: { width: "100%" } },
    h(
      Stack,
      { gap: "xs" },
      h(Text, { size: "sm", fw: 600, c: "dimmed" }, label),
      h(
        Checkbox.Group,
        { value, onChange },
        h(
          Group,
          { gap: "md" },
          ...options.map((option) =>
            h(Checkbox, { key: option.key, value: option.key, label: option.label }),
          ),
        ),
      ),
    ),
  );
}

function LinesToolbarRoot() {
  const state = useReportState();
  return h(CheckboxToolbarRoot, {
    label: "Lines displayed inside node",
    options: lineCategories,
    value: state.selectedLineCategoryKeys || [],
    onChange: (next) => actions.setLineCategoryKeys && actions.setLineCategoryKeys(next),
  });
}

function BrightnessToolbarRoot() {
  const state = useReportState();
  return h(CheckboxToolbarRoot, {
    label: "Module brightness criteria",
    options: brightnessCriteria,
    value: state.selectedBrightnessCriterionKeys || [],
    onChange: (next) => actions.setBrightnessCriterionKeys && actions.setBrightnessCriterionKeys(next),
  });
}

function ModuleDetailsRoot() {
  const state = useReportState();
  const node = useMemo(
    () => (reportData.nodes || []).find((item) => item.id === state.selectedModuleId) || null,
    [state.selectedModuleId],
  );

  if (!node) {
    return h(
      Paper,
      { withBorder: true, radius: "md", p: "md", bg: "#fbfcfd" },
      h(Text, { size: "sm", c: "dimmed" }, "Click a module to inspect its line and complexity metrics."),
    );
  }

  const activeBrightnessLabels = brightnessCriteria
    .filter((criterion) => (state.selectedBrightnessCriterionKeys || []).includes(criterion.key))
    .map((criterion) => criterion.label);
  const complexity = node.complexity || {};
  const methodCount = Number((complexity.cyclomatic && complexity.cyclomatic.count) || 0);
  const totalLines = Number(node.python_lines || 0);
  const pythonFileCount = Number(node.python_complexity_file_count || 0);

  return h(
    Paper,
    { withBorder: true, radius: "md", p: "md", bg: "#fbfcfd" },
    h(
      Stack,
      { gap: "sm" },
      h(
        Group,
        { justify: "space-between", align: "flex-start" },
        h(Title, { order: 3, size: "h4" }, node.id),
        h(Badge, { color: "teal", variant: "light" }, activeBrightnessLabels.length ? activeBrightnessLabels.join(", ") : "No brightness criteria"),
      ),
      h(
        SimpleGrid,
        { cols: { base: 1, sm: 2, lg: 3 }, spacing: "md" },
        h(DistributionCard, { title: "Cyclomatic", stats: complexity.cyclomatic }),
        h(DistributionCard, { title: "Cognitive", stats: complexity.cognitive }),
        h(DistributionCard, { title: "Jones nodes/line", stats: complexity.jones }),
        h(StatsCard, {
          title: "Method count",
          value: formatCodeLines(methodCount),
          subtitle: "Functions/methods counted by cyclomatic analysis",
        }),
        h(StatsCard, {
          title: "Code lines",
          value: formatCodeLines(totalLines),
          subtitle: "Production Python lines only, tests excluded",
        }),
        h(StatsCard, {
          title: "Python file count",
          value: formatCodeLines(pythonFileCount),
          subtitle: "Production Python files only, tests excluded",
        }),
      ),
    ),
  );
}

function FileDetailsRoot() {
  const state = useReportState();
  const node = useMemo(
    () => (reportData.nodes || []).find((item) => item.id === state.selectedModuleId) || null,
    [state.selectedModuleId],
  );
  const file = useMemo(() => {
    if (!node || !state.selectedFilePath) {
      return null;
    }
    return (node.files || []).find((item) => item.relative_path === state.selectedFilePath) || null;
  }, [node, state.selectedFilePath]);

  if (!node) {
    return h(
      Paper,
      { withBorder: true, radius: "md", p: "md", bg: "#fbfcfd" },
      h(Text, { size: "sm", c: "dimmed" }, "Hover a file tile to inspect its line and complexity metrics."),
    );
  }

  if (!file) {
    return h(
      Paper,
      { withBorder: true, radius: "md", p: "md", bg: "#fbfcfd" },
      h(Text, { size: "sm", c: "dimmed" }, `Module ${node.id}: hover a file tile to inspect its line and complexity metrics.`),
    );
  }

  const complexity = file.complexity || {};
  const categoryLabel = (lineCategories.find((category) => category.key === file.category) || {}).label || file.category;

  return h(
    Paper,
    { withBorder: true, radius: "md", p: "md", bg: "#fbfcfd" },
    h(
      Stack,
      { gap: "sm" },
      h(
        Group,
        { justify: "space-between", align: "flex-start" },
        h(
          Stack,
          { gap: 2 },
          h(Title, { order: 3, size: "h4" }, file.relative_path),
          h(Text, { size: "xs", c: "dimmed" }, `Module: ${node.id}`),
          h(Text, { size: "xs", c: "dimmed" }, `Lines: ${formatCodeLines(file.lines || 0)}`),
          h(Text, { size: "xs", c: "dimmed" }, `Category: ${categoryLabel}`),
        ),
      ),
      h(
        SimpleGrid,
        { cols: { base: 1, sm: 2, lg: 3 }, spacing: "md" },
        h(StatsCard, { title: "Functions", value: String(file.function_count || 0), subtitle: "Cyclomatic function count" }),
        h(StatsCard, { title: "AST lines", value: String(file.jones_line_count || 0), subtitle: "Jones AST measured lines" }),
        h(DistributionCard, { title: "Cyclomatic", stats: complexity.cyclomatic }),
        h(DistributionCard, { title: "Cognitive", stats: complexity.cognitive }),
        h(DistributionCard, { title: "Jones nodes/line", stats: complexity.jones }),
        h(StatsCard, {
          title: "Parse error",
          value: file.parse_error ? "Yes" : "No",
          subtitle: file.parse_error || "-",
        }),
      ),
    ),
  );
}

function ModuleCodeLinesRoot() {
  const rows = useMemo(
    () => [...(reportData.nodes || [])].sort((a, b) => (b.total_lines - a.total_lines) || a.id.localeCompare(b.id)),
    [],
  );

  return h(
    Panel,
    { title: "Module code lines" },
    h(
      Accordion,
      { defaultValue: "module-code-lines", variant: "contained" },
      h(
        Accordion.Item,
        { value: "module-code-lines" },
        h(Accordion.Control, null, "Show table"),
        h(
          Accordion.Panel,
          null,
          h(
            "div",
            { style: { overflowX: "auto" } },
            h(
              Table,
              { striped: true, highlightOnHover: true, withTableBorder: true, withColumnBorders: true, fontSize: "xs" },
              h(
                Table.Thead,
                null,
                h(
                  Table.Tr,
                  null,
                  h(Table.Th, null, "Module"),
                  h(Table.Th, null, "Total"),
                  ...lineCategories.map((category) => h(Table.Th, { key: category.key }, category.label)),
                  h(Table.Th, null, "Cyclomatic"),
                  h(Table.Th, null, "Cognitive"),
                  h(Table.Th, null, "Jones nodes/line"),
                ),
              ),
              h(
                Table.Tbody,
                null,
                ...rows.map((row) =>
                  h(
                    Table.Tr,
                    { key: row.id },
                    h(Table.Td, null, row.id),
                    h(Table.Td, null, formatCodeLines(row.total_lines || 0)),
                    ...lineCategories.map((category) => h(Table.Td, { key: `${row.id}-${category.key}` }, formatCodeLines(row[category.key] || 0))),
                    h(Table.Td, null, h(MetricText, { stats: row.complexity && row.complexity.cyclomatic })),
                    h(Table.Td, null, h(MetricText, { stats: row.complexity && row.complexity.cognitive })),
                    h(Table.Td, null, h(MetricText, { stats: row.complexity && row.complexity.jones })),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function PythonComplexityRoot() {
  const [moduleFilter, setModuleFilter] = useState(null);
  const [fileNeedle, setFileNeedle] = useState("");
  const rows = useMemo(() => {
    return (reportData.python_complexity_rows || []).filter((row) => {
      if (moduleFilter && row.module !== moduleFilter) {
        return false;
      }
      if (fileNeedle && !row.relative_path.toLowerCase().includes(fileNeedle.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [moduleFilter, fileNeedle]);

  return h(
    Panel,
    {
      title: "Python file complexity",
      subtitle: "Production Python files only: excludes tests and __manifest__.py. Cyclomatic/cognitive are function-level distributions; Jones is AST nodes per source line.",
    },
    h(
      Accordion,
      { defaultValue: "python-complexity", variant: "contained" },
      h(
        Accordion.Item,
        { value: "python-complexity" },
        h(Accordion.Control, null, "Show table"),
        h(
          Accordion.Panel,
          null,
          h(
            Stack,
            { gap: "md" },
            h(
              SimpleGrid,
              { cols: { base: 1, md: 2 }, spacing: "md" },
              h(Select, {
                label: "Module",
                placeholder: "All modules",
                clearable: true,
                data: moduleOptions,
                value: moduleFilter,
                onChange: setModuleFilter,
              }),
              h(TextInput, {
                label: "Path contains",
                placeholder: "models/sale_calculator.py",
                value: fileNeedle,
                onChange: (event) => setFileNeedle(event.currentTarget.value),
              }),
            ),
            h(Text, { size: "sm", c: "dimmed" }, `Visible files: ${rows.length} / ${(reportData.python_complexity_rows || []).length}`),
            h(
              "div",
              { style: { overflowX: "auto" } },
              h(
                Table,
                { striped: true, highlightOnHover: true, withTableBorder: true, withColumnBorders: true, fontSize: "xs" },
                h(
                  Table.Thead,
                  null,
                  h(
                    Table.Tr,
                    null,
                    h(Table.Th, null, "Module"),
                    h(Table.Th, null, "File"),
                    h(Table.Th, null, "Lines"),
                    h(Table.Th, null, "Functions"),
                    h(Table.Th, null, "AST lines"),
                    h(Table.Th, null, "Cyclomatic"),
                    h(Table.Th, null, "Cognitive"),
                    h(Table.Th, null, "Jones nodes/line"),
                    h(Table.Th, null, "Parse error"),
                  ),
                ),
                h(
                  Table.Tbody,
                  null,
                  ...rows.map((row) =>
                    h(
                      Table.Tr,
                      { key: `${row.module}:${row.relative_path}` },
                      h(Table.Td, null, row.module),
                      h(Table.Td, null, row.relative_path),
                      h(Table.Td, null, formatCodeLines(row.lines || 0)),
                      h(Table.Td, null, formatCodeLines(row.function_count || 0)),
                      h(Table.Td, null, formatCodeLines(row.jones_line_count || 0)),
                      h(Table.Td, null, h(MetricText, { stats: row.complexity && row.complexity.cyclomatic })),
                      h(Table.Td, null, h(MetricText, { stats: row.complexity && row.complexity.cognitive })),
                      h(Table.Td, null, h(MetricText, { stats: row.complexity && row.complexity.jones })),
                      h(Table.Td, null, row.parse_error ? h(Text, { size: "xs", c: "red" }, row.parse_error) : h(Text, { size: "xs", c: "dimmed" }, "-")),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function EvidenceStack({ evidence }) {
  if (!evidence || !evidence.length) {
    return h(Text, { size: "xs", c: "dimmed" }, "-");
  }
  return h(
    Stack,
    { gap: "xs" },
    ...evidence.map((item, index) =>
      h(
        Paper,
        { key: `${item.location}-${index}`, withBorder: true, radius: "sm", p: "xs", bg: "#fbfcfd" },
        h(
          Stack,
          { gap: 4 },
          h(Code, { block: true }, item.quote_text),
          h(Text, { size: "xs", c: "dimmed" }, item.location),
          h(Text, { size: "xs", c: "dimmed" }, item.detail),
        ),
      ),
    ),
  );
}

function EdgePointsRoot() {
  const [sourceFilter, setSourceFilter] = useState(null);
  const [targetFilter, setTargetFilter] = useState(null);
  const [minScore, setMinScore] = useState(1);
  const rows = useMemo(() => {
    return (reportData.edge_category_rows || []).filter((row) => {
      if (sourceFilter && row.source !== sourceFilter) {
        return false;
      }
      if (targetFilter && row.target !== targetFilter) {
        return false;
      }
      if (Number(row.points || 0) < Number(minScore || 0)) {
        return false;
      }
      return true;
    });
  }, [sourceFilter, targetFilter, minScore]);

  return h(
    Panel,
    { title: "Graph edge points" },
    h(
      Accordion,
      { defaultValue: "edge-points", variant: "contained" },
      h(
        Accordion.Item,
        { value: "edge-points" },
        h(Accordion.Control, null, "Show table"),
        h(
          Accordion.Panel,
          null,
          h(
            Stack,
            { gap: "md" },
            h(
              SimpleGrid,
              { cols: { base: 1, md: 3 }, spacing: "md" },
              h(Select, {
                label: "Source module",
                placeholder: "All modules",
                clearable: true,
                data: moduleOptions,
                value: sourceFilter,
                onChange: setSourceFilter,
              }),
              h(Select, {
                label: "Target module",
                placeholder: "All modules",
                clearable: true,
                data: moduleOptions,
                value: targetFilter,
                onChange: setTargetFilter,
              }),
              h(NumberInput, {
                label: "Min graph points",
                min: 0,
                value: minScore,
                onChange: setMinScore,
              }),
            ),
            h(Text, { size: "sm", c: "dimmed" }, `Visible category rows: ${rows.length} / ${(reportData.edge_category_rows || []).length}`),
            h(
              "div",
              { style: { overflowX: "auto" } },
              h(
                Table,
                { striped: true, highlightOnHover: true, withTableBorder: true, withColumnBorders: true, fontSize: "xs" },
                h(
                  Table.Thead,
                  null,
                  h(
                    Table.Tr,
                    null,
                    h(Table.Th, null, "Source"),
                    h(Table.Th, null, "Target"),
                    h(Table.Th, null, "Category"),
                    h(Table.Th, null, "Category points"),
                    h(Table.Th, null, "Edge total points"),
                    h(Table.Th, null, "Why points"),
                  ),
                ),
                h(
                  Table.Tbody,
                  null,
                  ...rows.map((row, index) =>
                    h(
                      Table.Tr,
                      { key: `${row.source}:${row.target}:${row.kind}:${index}` },
                      h(Table.Td, null, row.source),
                      h(Table.Td, null, row.target),
                      h(
                        Table.Td,
                        null,
                        h(
                          Stack,
                          { gap: 2 },
                          h(Text, { size: "xs", fw: 700 }, row.category_label),
                          h(Text, { size: "xs", c: "dimmed" }, row.kind),
                        ),
                      ),
                      h(Table.Td, null, formatCodeLines(row.points || 0)),
                      h(Table.Td, null, formatCodeLines(row.edge_points || 0)),
                      h(Table.Td, null, h(EvidenceStack, { evidence: row.evidence })),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function mount(id, componentFactory) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  createRoot(element).render(withProvider(componentFactory()));
}

mount("reportSummaryRoot", () => h(SummaryRoot));
mount("linesToolbarRoot", () => h(LinesToolbarRoot));
mount("brightnessToolbarRoot", () => h(BrightnessToolbarRoot));
mount("graphModuleDetails", () => h(ModuleDetailsRoot));
mount("fileMapDetails", () => h(FileDetailsRoot));
mount("moduleCodeLinesRoot", () => h(ModuleCodeLinesRoot));
mount("pythonComplexityRoot", () => h(PythonComplexityRoot));
mount("edgePointsRoot", () => h(EdgePointsRoot));
