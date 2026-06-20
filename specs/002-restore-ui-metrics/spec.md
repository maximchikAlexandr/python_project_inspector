# Feature Specification: Restore Lost UI & Metrics Parity, Rename to `ppi`, In-Project `.ppi` Store

**Feature Branch**: `002-restore-ui-metrics`

**Created**: 2026-06-20

**Status**: Draft (escalations resolved 2026-06-20 — see Open Questions & Escalations)

**Input**: User description: "The previous spec migrated the repository to new functionality, but part of the existing functionality was lost. `.devlocal/odoo_arch_inspector_gap_report.md` analyzes what was lost during the migration (mostly UI and collected metrics). The old version exists in git. Plan the rework of the UI and metrics. Escalate any uncertainties where the gap report contradicts the previous specification, the constitution, `.devlocal/business.md`, or `.devlocal/architecture.md`. Additional scope: (1) shorten the project name everywhere except the README and the repository name from `python_project_inspector` to `ppi` — in Python code and console commands; (2) the analyzed project must get a `.ppi` folder that holds at least the DuckDB files."

## Overview

Feature 001 turned the one-shot Odoo coupling reporter into a history-aware pipeline (history walk → DuckDB store → time-series dashboard → CLI). During that migration, a large part of the original `odoo_arch_inspector` capability was dropped: per-relation **evidence**, several **collected metrics**, and almost the entire **interactive HTML report UI**. `.devlocal/odoo_arch_inspector_gap_report.md` is the authoritative inventory of what was lost.

This feature restores parity with the old tool's analytical depth **on top of** the new history-aware foundation, so that every restored capability becomes commit-aware (viewable at any analyzed commit and comparable across commits) rather than a single snapshot. It also fixes consistency defects introduced in the new implementation (ambiguous edge counts, aggregation-blind hotspots).

Two operational changes are bundled in:

1. **Rename** the project's internal name from `python_project_inspector` to `ppi` everywhere in Python code and console commands (the human-readable product name in the README and the git repository name are explicitly kept).
2. **In-project `.ppi` store**: the analyzed project gets a `.ppi/` directory that holds at least the project's DuckDB store, instead of (or in addition to) the current user-level analysis directory.

This is an explicit **expansion** of feature 001's assumption that "metrics are reused unchanged"; restored and new metrics are now in scope. Where the gap report conflicts with feature 001, the constitution, `.devlocal/business.md`, or `.devlocal/architecture.md`, the conflicts are captured in **Open Questions & Escalations** and surfaced to the owner before planning.

## Clarifications

### Session 2026-06-20

- Q: Does the module graph include the net-new `.devlocal/business.md` §26 enhancements (center-on-module + depth, graph display settings, source-based coloring), or only old-tool parity? → A: Strictly old-tool parity (all-modules graph + brightness); §26.1/§26.2/§26.4 enhancements are deferred to a later feature.
- Q: How should per-relation source quotes be stored at history scale? → A: Source quotes are dropped from this feature entirely; evidence stores only kind, file path, line, and detail. Capturing source quotes is deferred to a later feature.
- Q: What does "method count" mean in the restored module detail/brightness? → A: Old-tool semantics — the count of functions/methods from the cyclomatic (radon) analysis (parity), not the Odoo class-analyzer method count.
- Q: When the store moves to `.ppi/`, is the existing user-level DuckDB migrated? → A: No migration; `.ppi/` is created empty and populated by a normal (incremental) analysis run. The old user-level store is superseded and may be deleted manually. (New metrics require re-analysis regardless.)
- Q: Should the PyPI distribution name also be shortened to `ppi`? → A: Yes — rename the PyPI distribution name to `ppi` as well (only the README product name and the git repository name stay long).
- Q: Does the graph reproduce the old force-directed layout? → A: Yes — reproduce the old tool's force-directed layout (node attraction by points and curved reverse edges), as old-tool parity.
- Q: How are the edges chart and edge table reconciled (FR-027)? → A: Apply a single consistent edge-inclusion rule by default, plus an explicit toggle that reveals zero-score edges; the chart count and visible table rows must match for the active rule.
- Q: Where are the new commit-scoped reads, evidence, breakdowns, and series exposed? → A: Everywhere — via both the CLI (`ppi query`) and the HTTP API.
- Q: Is there a performance target for snapshot reads / graph rendering? → A: Not needed in this feature; no explicit performance target is set (deferred).
- Q: Is module scope filtering restored? → A: Yes — restore module scope filtering (module-prefix / include-module / all-modules) and persist the selected scope; "in-scope" is defined by the selected scope.

## Open Questions & Escalations *(must be resolved before `/speckit-plan`)*

These are the contradictions/uncertainties found between the gap report and the existing specification / constitution / business / architecture documents. The three blocking ones (E1, E2, E3) were escalated to the owner and resolved on 2026-06-20; their decisions are recorded below and propagated into the requirements.

### Resolved (owner decisions, 2026-06-20)

- **E1 — In-project `.ppi` location vs. "outside the repo" invariant. → Resolved: DuckDB only.** Only the per-project DuckDB store moves into a `.ppi/` directory in the analyzed project root. All other technical artifacts (git worktrees, write lock, runtime/socket, staging, raw artifacts) stay **outside** the analyzed repository, under the existing user-level analysis directory. The `assert_outside_repo` invariant is relaxed **only** for the DuckDB store; it continues to guard every other artifact. The previous user-level store location is **superseded** by `.ppi/` (the store now lives in the project). `.ppi/` is kept out of Git by a self-ignoring `.ppi/.gitignore` containing `*` (so the directory ignores its own contents, including the `.gitignore` entry itself is unnecessary because `*` already covers it), created automatically when `.ppi/` is created.

- **E2 — Generic registry-driven UI vs. Odoo-specific parity UI. → Resolved: generalize now.** The restored surfaces are built on the **generic, registry-driven UI** (entity kinds / metric definitions / edge layers / active profile), per Constitution Principle IV and `.devlocal/architecture.md` §7. Odoo-specific data (modules, manifest dependencies, model-reuse/extension/view/field breakdown) flows in through the active `odoo` profile and the metric/edge registry, not via UI code hard-wired to Odoo. The graph, treemap, panels, and tables are profile-agnostic shells parameterized by the registry.

- **E3 — Plugin registry now vs. extending the built-in analyzer. → Resolved: extend the built-in analyzer.** The `pluggy` registry remains deferred (the justified partial from feature 001 stands). The restored/new collected data (evidence, `python_file_count`, `top_folder`, graph-point breakdown, declared/inherited model lists, per-kind/per-category series) is added by **extending the existing built-in analyzer provider** behind the typed fact/batch contract, without breaking the existing time-series store contract.

### Non-blocking (resolved with documented defaults; flag if wrong)

- **E4 — Supersedes "metrics reused unchanged".** Feature 001 assumed metrics are reused unchanged. This feature deliberately adds new collected data (evidence without source quotes, file counts, top_folder, model lists, breakdowns). Default: 001's assumption is superseded for the Odoo profile; this is intended, not a defect.
- **E5 — Snapshot vs. time-series API.** 001's API is time-series oriented; the old UI is snapshot oriented. Default: add commit-scoped snapshot reads **in addition to** the existing time-series reads; do not remove time-series.
- **E6 — Source-quote capture. → Superseded (2026-06-20):** Source quotes are dropped from this feature entirely (see Clarifications). Evidence stores only kind, file path, line, and detail; quote capture and any blob/source-artifact storage for quotes are deferred to a later feature.
- **E7 — Rename breadth. → Resolved (2026-06-20):** Rename the import package `python_project_inspector` → `ppi`, the console command `python-project-inspector` → `ppi`, the PyPI distribution name → `ppi`, and the in-project technical directory to `.ppi/`. Only the human-readable product name in the README and the git repository name stay long.
- **E8 — Optional `total_file_count`.** The gap report marks a whole-module `total_file_count` as a new (non-parity) metric. Default: out of scope for this feature; only the parity metric `python_file_count` (production Python files, excluding tests and `__manifest__.py`) is in scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore lost analysis data (evidence + dropped metrics) (Priority: P1)

As a developer analyzing an Odoo project's history, I want the tool to capture everything the old `odoo_arch_inspector` captured — per-relation evidence and the metrics that were dropped — so that the data needed for the old report exists in the store for every analyzed commit.

**Why this priority**: Every restored UI surface and snapshot query depends on this data existing in the store. Without it, parity is impossible; UI work would have nothing to read. It is the foundational, independently valuable slice.

**Independent Test**: Analyze a small fixture Odoo repo, then inspect the store and confirm that for a coupling relation you can retrieve its evidence (kind, file path, line, detail), the graph-point breakdown (model_reuse / extension_or_method / view / field_property / total), the `python_file_count`, each file's `top_folder`, and the declared/inherited model name lists — at the analyzed commit.

**Acceptance Scenarios**:

1. **Given** a commit containing a cross-module relation, **When** analysis runs, **Then** the store holds one evidence record per occurrence with its kind, file path, line, and detail.
2. **Given** a stored coupling edge, **When** its score is examined, **Then** the per-category breakdown (model_reuse, extension_or_method, view, field_property, total) is available, not only a single aggregate score.
3. **Given** an analyzed module, **When** its aggregate is read, **Then** `python_file_count` (production Python files, excluding tests and `__manifest__.py`) is available as a first-class metric.
4. **Given** an analyzed file, **When** its record is read, **Then** its first-level folder (`top_folder`) is available.
5. **Given** an analyzed Odoo module, **When** its record is read, **Then** the concrete declared model names, inherited model names, and in-scope manifest dependencies are available — not only their counts.
6. **Given** relation kinds outside the scoring groups (e.g., `security_*`, `manifest_depends`), **When** analysis runs, **Then** they are still recorded and retrievable even when their contribution to the computed score is zero.

---

### User Story 2 - Read any commit's full state and relation evidence (snapshot/parity API) (Priority: P2)

As a dashboard or CLI user, I want to retrieve the complete state of the project at a chosen commit — modules, files, per-module and per-file detail, the module graph, edge points, and relation evidence — so the old snapshot-style report can be rebuilt on history-aware data.

**Why this priority**: The restored UI is snapshot-oriented; it needs commit-scoped reads. This layer turns the US1 data into something the UI and CLI can consume, and is independently testable via direct queries.

**Independent Test**: With a populated store, request "modules at commit C", "files at commit C for module M", "module detail", "file detail", "graph at commit C", and "edge evidence for source→target at commit C", and verify each returns the stored data for that commit without re-running analysis.

**Acceptance Scenarios**:

1. **Given** a populated store, **When** the user requests the module list at a commit, **Then** they get each module with its line categories and complexity distributions for that commit.
2. **Given** a populated store, **When** the user requests files at a commit for a module, **Then** they get each file with lines, category, function count, AST lines, complexity distributions, and parse-error status.
3. **Given** a populated store, **When** the user requests the module graph at a commit, **Then** they get nodes (modules with size/complexity attributes) and directed edges (with score and per-category points).
4. **Given** a populated store, **When** the user requests edge evidence for a source→target pair at a commit, **Then** they get the evidence stack (location, detail) per relation kind/category.
5. **Given** existing time-series endpoints, **When** snapshot reads are added, **Then** the existing time-series reads keep working unchanged.

---

### User Story 3 - Rebuild the interactive Odoo report UI on history-aware data (Priority: P2)

As a developer, I want the old report's interactive surfaces back — an interactive module graph, line-category and brightness controls, module/file detail panels, a module file treemap, the module-code-lines and Python-file-complexity tables, and the edge-points table with evidence — but now driven by a commit selector so I can inspect any point in history.

**Why this priority**: This is the visible product value the owner lost. It depends on US1 (data) and US2 (commit-scoped reads) but delivers the primary user-facing parity.

**Independent Test**: With a populated store, open the dashboard, pick a commit, and confirm each restored surface renders from stored data: graph, line-category toolbar, brightness toolbar, module detail, file treemap, file detail, module-code-lines table, Python-file-complexity table, and edge-points table with evidence.

**Acceptance Scenarios**:

1. **Given** a selected commit, **When** the user opens the module graph, **Then** they see nodes (Odoo modules) and directed edges with thickness reflecting relation strength, can drag/select nodes, zoom in/out/fit, and pan.
2. **Given** the module graph, **When** the user toggles line categories (python code, JS, python test, xml view, css, html), **Then** node values and the treemap reflect the selected categories.
3. **Given** the module graph, **When** the user toggles brightness criteria (cyclomatic median, cognitive median, jones median, method count, code lines, Python file count), **Then** node coloring reflects the selected weighted criteria.
4. **Given** a selected module, **When** the user opens its detail panel, **Then** they see cyclomatic/cognitive/jones distributions, method count (functions/methods from cyclomatic analysis), code lines, Python file count, parse-error count, and score in/out for that commit.
5. **Given** a selected module, **When** the user opens its file treemap, **Then** file tiles are sized by line count, colored by first-level folder with a legend, filterable by line category, with selectable tiles opening a file detail panel (path, module, lines, category, function count, AST lines, complexity distributions, parse error).
6. **Given** a selected commit, **When** the user opens the module-code-lines table and the Python-file-complexity table, **Then** they see all modules/files with line categories and complexity columns, with module and path filters and a visible-rows counter.
7. **Given** a selected edge, **When** the user opens the edge-points table, **Then** they see rows per relation category with category points, edge total points, a "why points" explanation, and an evidence stack (location, detail), with source/target and minimum-points filters.
8. **Given** any restored surface, **When** the user changes the selected commit, **Then** all surfaces update to that commit's data.

---

### User Story 4 - Trustworthy, history-aware analytics (consistency + new series) (Priority: P3)

As a developer, I want the analytics to be internally consistent and to exploit the new history dimension — aggregation-aware hotspots, per-category line series, file-count series, edge-kind series, and added/removed relations between commits — so I can trust the numbers and analyze evolution, not just snapshots.

**Why this priority**: These fix correctness defects (hotspots ignore the chosen aggregation; the edges chart and edge table disagree) and add the historical analyses the old snapshot tool never had. Valuable but builds on US1/US2.

**Independent Test**: With a populated store, select a non-mean aggregation and confirm hotspots and the complexity chart use the same aggregate; confirm the edges chart and the edge table agree on what counts as an edge; request per-category line, file-count, and edge-kind series and a between-commits added/removed-relations diff.

**Acceptance Scenarios**:

1. **Given** an aggregation selection (mean/median/p95/max), **When** the user views hotspots, **Then** hotspots rank by the selected aggregate, matching the complexity chart.
2. **Given** the structure view, **When** the user compares the edges chart with the edge table, **Then** both apply the same edge-inclusion rule (or the UI clearly distinguishes scored vs. zero-score edges with a visible filter), so the chart count matches the visible rows.
3. **Given** a populated store, **When** the user requests line counts over time, **Then** they can break the series down by category, not just total lines.
4. **Given** a populated store, **When** the user requests file count over time, **Then** they get a `python_file_count` series per module.
5. **Given** a populated store, **When** the user requests relation evolution, **Then** they can see edge-kind counts over time and which relations appeared/disappeared between two selected commits.

---

### User Story 5 - Use the short name `ppi` (Priority: P2)

As a developer and CLI user, I want the project's internal name and command shortened to `ppi` so day-to-day usage and code are simpler, while the human-readable product name in the README and the repository name stay as they are.

**Why this priority**: A small, self-contained, owner-requested change that improves daily ergonomics; independent of the metrics/UI work.

**Independent Test**: Run the console command as `ppi --help`; import paths use `ppi`; the README still presents the full product name and the repository name is unchanged.

**Acceptance Scenarios**:

1. **Given** the installed tool, **When** the user runs the console command, **Then** it is invoked as `ppi` and its subcommands work as before.
2. **Given** the source tree, **When** code is read, **Then** the import package and internal identifiers use `ppi` rather than `python_project_inspector`.
3. **Given** the documentation, **When** the README is read, **Then** the full human-readable product name and the repository name are preserved.
4. **Given** the rename, **When** all commands and tests run, **Then** behavior is unchanged except for the new name.

---

### User Story 6 - Per-project `.ppi` store directory (Priority: P2)

As a developer, I want each analyzed project to keep its analysis data in a `.ppi/` directory inside that project (holding at least the DuckDB store) so the data lives with the project and is easy to find, without being committed to the project's Git history.

**Why this priority**: Owner-requested operational change; foundational to where data lives, so it should land early, but it is independent of the metrics/UI parity work.

**Independent Test**: Analyze a project and confirm a `.ppi/` directory is created in the project root containing the DuckDB store, and that `.ppi/` is excluded from the project's Git tracking.

**Acceptance Scenarios**:

1. **Given** an analyzed project, **When** analysis runs, **Then** a `.ppi/` directory exists in the project root containing the project's DuckDB store file, while worktrees/locks/runtime remain outside the repository.
2. **Given** the system creates `.ppi/`, **When** the directory is created, **Then** it contains a `.ppi/.gitignore` file whose content is `*`, so the whole directory self-ignores in Git.
3. **Given** the `.ppi/` directory, **When** the project's Git status is checked, **Then** `.ppi/` is ignored and does not appear as tracked or committed content.
4. **Given** a project that previously stored its DuckDB at the user-level location, **When** it is analyzed again, **Then** the tool resolves the store deterministically to the project's `.ppi/` directory and populates it from a fresh analysis run — the old user-level store is not migrated and is superseded.

---

### Edge Cases

- **Relation kinds with zero score** (security/manifest kinds outside scoring groups): they remain visible/retrievable; the UI must not silently hide them by a default minimum-score filter.
- **Module with no production Python files**: `python_file_count` is recorded as zero and downstream views handle the empty case.
- **Empty treemap for a selected line category** (module has no files in that category): the treemap shows an explicit empty state.
- **`.ppi/` directory cannot be created or written** (permissions/read-only checkout): the tool fails fast with a clear message rather than silently falling back.
- **`.ppi/` accidentally already tracked in the analyzed repo**: the tool warns rather than corrupting the user's Git state (a self-ignoring `.gitignore` does not retroactively untrack already-committed files).
- **`.ppi/.gitignore` already exists**: the tool ensures it contains `*` (does not blindly overwrite unrelated user content without preserving the self-ignore guarantee).
- **Rename collisions**: no stray `python_project_inspector` import path remains after the rename; the tool does not ship both names ambiguously.
- **Large evidence volume**: per-occurrence evidence (kind/file/line/detail) MUST be written incrementally per commit (streamed and persisted as each commit is analyzed), never buffered in memory for all commits at once. This is a behavioral constraint, not a performance target (no throughput/latency bound is set this feature — see Assumptions → Performance).

## Requirements *(mandatory)*

### Functional Requirements

#### Restored & new collected data (depends on E3)

- **FR-001**: The system MUST capture, for each cross-module relation occurrence, evidence consisting of relation kind, file path, line number, and a human-readable detail, and persist it per analyzed commit.
- **FR-002**: The system MUST NOT capture or store source quotes in this feature; evidence is limited to kind, file path, line, and detail. (Source-quote capture is explicitly deferred to a later feature.)
- **FR-003**: The system MUST compute and persist the graph-point breakdown per edge across exactly four categories, where `total` = `model_reuse` + `extension_or_method` + `view` + `field_property`, and each category is the sum of the occurrences of a defined set of relation kinds (parity with the old tool's scoring groups):
  - **model_reuse**: `python_many2one`, `python_one2many`, `python_many2many`, `python_related`, `python_api_depends`, `python_api_onchange`, `python_api_constrains`, `python_env_model`, `security_ir_rule_model_ref`.
  - **extension_or_method**: `python__inherit`, `python_method_call`, `python_private_method_call`.
  - **view**: `xml_inherit_id`, `xml_ref`, `xml_percent_ref`.
  - **field_property**: `python_field_property_access`.

  The breakdown MUST be persisted, and MUST also be reproducible from the stored per-kind occurrence counts using this same kind-to-category mapping (the mapping is the single source of truth). Relation kinds outside these four groups (e.g., `manifest_depends`, `security_csv_ref`, `security_xml_ref`, `security_ir_rule_ref`) contribute zero points but are still retained per FR-007.
- **FR-004**: The system MUST persist `python_file_count` per module aggregate, defined as the count of production Python files (parity with the old tool). A file is **excluded** from this count when it is `__manifest__.py` or is a **test file**, where a test file is any `.py` file located under a `tests/` (or `__tests__/`) directory of the module, or whose name starts with `test_` or ends with `_test.py`.
- **FR-005**: The system MUST persist each file's first-level folder (`top_folder`), defined as the first path segment of the file's module-relative path; for a file located directly in the module root (no first-level subfolder) the value MUST be the sentinel `.` so that `top_folder` is always non-empty.
- **FR-006**: The system MUST persist the concrete declared model names, inherited model names, and in-scope manifest dependencies per module (not only counts).
- **FR-007**: The system MUST retain and expose relation kinds that fall outside the scoring groups (e.g., `security_*`, `manifest_depends`) so they remain retrievable even with a zero computed score.
- **FR-008**: The system MUST distinguish and expose three distinct relation-count meanings: distinct module-pair edges, per-kind occurrence counts within a pair, and evidence counts behind each kind.
- **FR-009**: New/restored collected data MUST be added by extending the existing built-in analyzer provider behind the typed fact/batch contract (the `pluggy` registry stays deferred), without breaking the existing time-series store contract.

#### Snapshot / parity reads (depends on E2 for surface naming)

- **FR-010**: The system MUST provide commit-scoped reads for: modules at a commit, files at a commit (per module), module detail, file detail, the module graph payload, edge points, and edge evidence.
- **FR-011**: Snapshot reads MUST be additive; existing time-series reads MUST continue to function unchanged.
- **FR-012**: Reads MUST expose the line categories, complexity distributions, function/method counts, AST lines, parse-error status, `python_file_count`, `top_folder`, model lists, edge breakdown, and evidence captured by FR-001–FR-008.

#### Restored interactive UI (generic registry-driven, per E2)

- **FR-013**: The UI MUST provide an interactive module graph at a selected commit reproducing the old tool's force-directed layout (node attraction proportional to edge points, curved reverse edges), with directed edges, edge thickness that encodes the edge total points (`EdgeBreakdown.total`, i.e. the computed coupling score) and is monotonically non-decreasing in it, node drag, node selection, background-click clear, zoom in/out/fit, and pan.
- **FR-014**: The UI MUST provide a line-category toolbar (python code, JS, python test, xml view, css, html) that drives node values and the treemap.
- **FR-015**: The UI MUST provide a brightness toolbar with individually toggleable criteria (cyclomatic median, cognitive median, jones median, method count, code lines, Python file count) that color the graph nodes. The combined node brightness MUST be computed deterministically: each toggled criterion's per-module value is normalized to `[0, 1]` across the modules visible at the selected commit (min–max normalization; if all values are equal the normalized value is `0`), the normalized values of the toggled criteria are combined by an equally-weighted average (default weight equal per criterion), and the resulting `[0, 1]` value maps monotonically onto a single continuous node color scale (higher value = more intense). When no criterion is toggled, nodes use the neutral base color. The "code lines" criterion MUST use the same definition as the old tool (production Python lines).
- **FR-016**: The UI MUST provide a module detail panel showing cyclomatic/cognitive/jones distributions, method count, code lines, Python file count, parse-error count, and score in/out at the selected commit. "Method count" MUST use the old-tool definition: the number of functions/methods detected by the cyclomatic (radon) analysis, not the Odoo class-analyzer method count.
- **FR-017**: The UI MUST provide a module file treemap with tiles sized by line count, colored by first-level folder with a legend, filterable by line category, with selectable tiles and an explicit empty state.
- **FR-018**: The UI MUST provide a file detail panel (path, module, lines, category, function count, AST lines, cyclomatic/cognitive/jones distributions, parse error) at the selected commit.
- **FR-019**: The UI MUST provide a module-code-lines table (module, total, all line categories, cyclomatic, cognitive, jones) for the selected commit.
- **FR-020**: The UI MUST provide a Python-file-complexity table (module, file, lines, functions, AST lines, cyclomatic, cognitive, jones, parse error) with module and path filters and a visible-rows counter.
- **FR-021**: The UI MUST provide an edge-points table with rows per relation category (category points, edge total points, a "why points" explanation, evidence stack with location/detail) and source/target plus minimum-points filters. The "why points" explanation for a category MUST state the relation kinds that contributed to that category and each kind's occurrence count (so the category's point value is reproducible from the stored breakdown and evidence).
- **FR-022**: The UI MUST provide a manifest dependency view distinct from the computed coupling score.
- **FR-023**: All restored snapshot surfaces MUST be driven by a commit selector and update consistently when the selected commit changes.
- **FR-024**: The UI MUST surface parse/failure details (which files failed to parse, at which commit, with the error) tied to file metric parse-error status.
- **FR-025**: The restored surfaces MUST be built on the generic, registry-driven UI (entity kinds / metric definitions / edge layers / active profile); Odoo-specific data MUST flow in through the active `odoo` profile and the metric/edge registry rather than UI code hard-wired to Odoo.

#### History-aware analytics & consistency

- **FR-026**: Hotspots MUST honor the selected aggregation (mean/median/p95/max) and match the aggregation used by the complexity chart.
- **FR-027**: The system MUST apply a single consistent edge-inclusion rule across the structure/edges chart, the edge table, the CLI edge reads, and the API edge endpoints. The **default** rule includes only edges whose total score is `>= 1`; an explicit toggle (`include_zero_score`) additionally reveals edges with total score `= 0` (relation kinds outside the scoring groups). For any given value of the toggle, all surfaces (chart, table, CLI, API) MUST return the same set of edges, so the chart count matches the visible table rows and matches the CLI/API results.
- **FR-028**: The system MUST provide line-count-over-time broken down by category.
- **FR-029**: The system MUST provide `python_file_count`-over-time per module.
- **FR-030**: The system MUST provide edge-kind counts over time and an added/removed-relations comparison between two selected commits.

#### Rename to `ppi`

- **FR-031**: The system MUST expose its console command as `ppi`, and the PyPI distribution name MUST be `ppi`.
- **FR-032**: The system's Python import package and internal identifiers MUST use `ppi` instead of `python_project_inspector`.
- **FR-033**: The README's human-readable product name and the git repository name MUST be preserved (not shortened).
- **FR-034**: After the rename, all existing behavior MUST be unchanged except for the name; no `python_project_inspector` import path may remain reachable.

#### In-project `.ppi` store

- **FR-035**: The system MUST place each analyzed project's DuckDB store inside a `.ppi/` directory in that project's root; all other technical artifacts (git worktrees, write lock, runtime/socket, staging, raw artifacts) MUST stay outside the analyzed repository in the user-level analysis directory.
- **FR-036**: When the system creates `.ppi/`, it MUST also create a self-ignoring `.ppi/.gitignore` whose content is `*`, so the entire `.ppi/` directory (including all current and future contents) is excluded from the analyzed project's Git tracking without requiring any edit to the project's own `.gitignore`.
- **FR-037**: The `assert_outside_repo` invariant MUST be relaxed only for the DuckDB store; it MUST continue to forbid every other artifact from living inside the analyzed repository. The previous user-level store location is superseded by `.ppi/` with no automatic migration (the `.ppi/` store is populated by a fresh analysis run); no analysis artifact may be committed to the analyzed project's Git history.
- **FR-038**: The system MUST fail fast with a clear message when `.ppi/` cannot be created or written.

#### Access surfaces & analysis scope

- **FR-039**: All new commit-scoped reads (snapshots, module/file detail, graph, edge points), evidence, graph-point breakdown, and new time-series (per-category lines, `python_file_count`, edge-kind counts, added/removed relations) MUST be accessible via BOTH the CLI (`ppi query`) and the HTTP API.
- **FR-040**: The system MUST restore module scope filtering (module-prefix, include-module, all-modules), persist the selected scope with the analysis, and use it consistently; "in-scope" manifest dependencies and model lists are defined relative to the selected scope.
- **FR-041**: When any commit-scoped or edge read is given a selector that does not exist in the store (unknown commit hash, unknown module, unknown file, or an unknown source/target edge pair), the system MUST return a clear, typed error identifying the bad selector rather than an empty success result, and this behavior MUST be consistent across the CLI and the HTTP API.

### Key Entities *(include if feature involves data)*

- **Evidence**: a single justification for a relation occurrence — relation kind, file path, line, and detail (no source quote in this feature); tied to a commit, a source module, and a target module.
- **Edge breakdown**: per-edge category points (model_reuse, extension_or_method, view, field_property) plus the total, for a commit.
- **Relation kind occurrence**: count of a specific relation kind within a module pair at a commit, retained even when its score contribution is zero.
- **Module aggregate (extended)**: existing per-module roll-up plus `python_file_count`, declared model names, inherited model names, and in-scope manifest dependencies.
- **File record (extended)**: existing per-file metrics plus `top_folder`.
- **Module graph payload**: nodes (modules with size/complexity attributes) and directed edges (score, per-category points) at a commit.
- **Snapshot view**: the complete set of modules, files, details, graph, edge points, and evidence for one commit.
- **`.ppi` store directory**: per-project in-project technical directory holding at least the DuckDB store, excluded from the project's Git.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any analyzed commit, a user can retrieve, for a given coupling relation, its evidence (kind, file, line, detail) — a capability that is currently impossible.
- **SC-002**: For any analyzed commit, a user can open a complete snapshot of the project (modules, files, module/file detail, module graph, edge points, evidence) entirely from stored data, without re-running analysis.
- **SC-003**: Every restored old-report surface (module graph, line-category toolbar, brightness toolbar, module detail, file treemap, file detail, module-code-lines table, Python-file-complexity table, edge-points table with evidence, manifest dependency view, parse/failure view) is available and renders from stored data at a user-selected commit.
- **SC-004**: A user can obtain the production `python_file_count` per module and each file's first-level folder from the store/API/UI.
- **SC-005**: Hotspots reflect the user's chosen aggregation (verified for median/p95/max, not only mean), and the structure edges chart count matches the visible edge-table rows (or the UI explicitly shows the zero-score filter).
- **SC-006**: A user can view line counts by category over time, `python_file_count` over time, edge-kind counts over time, and the relations added/removed between two commits.
- **SC-007**: The tool is driven via the `ppi` command and no reachable `python_project_inspector` import path remains, while the README product name and repository name are unchanged.
- **SC-008**: After analyzing a project, a `.ppi/` directory exists in the project root with the DuckDB store inside it and a self-ignoring `.ppi/.gitignore` (`*`), and the analyzed project's Git status shows no tracked/committed analysis artifacts.
- **SC-009**: The parity checklist from the gap report ("Проверочные признаки завершения parity") is fully satisfied: full graph payload per commit; edges with evidence (file/line/detail; source quote deferred); module and file snapshots; treemap; category filtering; brightness coloring; graph-point breakdown with explanations; manifest dependencies separate from coupling score; production Python file count exposed; explicit distinction of distinct edges vs. per-kind vs. evidence counts; consistent edge count vs. table; aggregation-aware hotspots; parse/failure details viewable.

## Assumptions

- **Profile**: This parity work targets the **Odoo** analysis profile, since the lost capability is the Odoo report. The generic Python profile is unaffected except where E2 generalizes UI surfaces.
- **Old tool as reference**: The old `odoo_arch_inspector` (in git) is the behavioral reference for restored metrics, scoring groups, and UI semantics.
- **History-aware, not snapshot-only**: Restored surfaces are layered on the new history store and gain a commit selector; the original tool's single-snapshot behavior corresponds to "the tip commit" in the new model.
- **Reuse of feature 001 foundation**: The history walk, DuckDB store, single-writer lock, CLI, and FastAPI/React stack from feature 001 are reused; this feature extends them rather than replacing them.
- **Local-only & technology constraints**: Storage (DuckDB), single-writer ownership, server mode, packaging, and serialization remain governed by the constitution and `.devlocal/architecture.md`.
- **`total_file_count`**: Out of scope (E8); only `python_file_count` parity is required.
- **Rename breadth**: Per E7, import package + console command + PyPI distribution name + in-project directory become `ppi`; only the README product name and the repository name are preserved.
- **Graph scope**: This feature delivers only old-tool graph parity (all-modules view + brightness coloring + the old force-directed layout). The net-new `.devlocal/business.md` §26 graph enhancements — center-on-one-module with depth (§26.1), graph display settings such as attraction/precision/link thickness/distance (§26.2), and source-based node coloring of Core Addon vs. target-project addon (§26.4) — are explicitly out of scope and deferred to a later feature.
- **Access surfaces**: All restored/new data is exposed via both the CLI (`ppi query`) and the HTTP API (FR-039).
- **Module scope**: Module scope filtering (module-prefix / include-module / all-modules) is restored and persisted with the analysis (FR-040), superseding feature 001's always-`all_modules` behavior.
- **Performance**: No explicit performance target for snapshot reads or graph rendering is set in this feature; performance tuning is deferred.
