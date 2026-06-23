# Feature Specification: VS Code Extension — Thin Bridge

**Feature Branch**: `004-vscode-extension-bridge`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "Этап 5 из .devlocal/todo.md — добавить VS Code extension как тонкий bridge. Создать минимальное расширение, добавить команду запуска анализа из VS Code, запускать Python CLI из расширения, открыть Webview с переиспользованием существующего frontend, передавать результаты анализа в UI, добавить настройку профиля проекта."

## Overview

The project already ships a CLI that analyzes a Git repository and a browser dashboard that visualizes the results. Today an analyst has to leave the editor, open a terminal, run the CLI, start the dashboard server, and switch to a browser to inspect metrics. This feature closes that loop inside the IDE: a lightweight extension lets the analyst trigger analysis on the currently open workspace and view the resulting analytics in a panel embedded in the editor, reusing the existing frontend rather than building a parallel UI.

The extension is intentionally a *thin bridge* — it does not own analysis logic or storage. It invokes the already-installed CLI to run analysis and points the embedded dashboard at the analysis results. A project profile setting (e.g. plain Python versus an Odoo project) lets the analyst pick how the workspace is interpreted without leaving the extension.

All capabilities are client-side orchestration layered on the existing CLI and dashboard; no new analysis engine or storage is introduced in this stage.

## Clarifications

### Session 2026-06-22

- Q: Какой механизм расширение использует для передачи результатов во встроенный дашборд? → A: Вариант C — webview хостит существующий бандл фронтенда, результаты передаются в панель через postMessage от расширения; сервер FastAPI не поднимается. Для паритета фронтенд получает тонкий results-ingest адаптер (абстракцию источника данных), чтобы тот же бандл работал и в браузере (через сервер), и в панели (через postMessage).
- Q: Откуда расширение получает живой прогресс анализа? → A: Вариант B — формализовать контракт прогресса в CLI. Конкретно: добавить флаг `--json` к команде `analyze`, который выводит машиночитаемый поток событий (JSON-lines) на stdout — запуск, прогресс по коммитам (processed/total, текущий short hash), завершение/ошибка. Расширение парсит этот поток. Это инкрементальная доработка: в CLI уже есть структурированный `RunMeta` (status, commits_total/succeeded/failed), `--jsonl` для батчей и `--format json` у `query`/`serve`; при `--json` человеко-читаемый `click.progressbar` подавляется и заменяется машиночитаемым потоком событий. Изменение не затрагивает логику анализа и не нарушает принцип тонкого клиента.
- Q: Поддерживает ли этот этап явную отмену запущенного анализа? → A: Вариант B — поддерживается базовая отмена: расширение терминирует порождённый процесс CLI, статус переходит в `cancelled`, без отката уже записанных результатов. Полноценная отмена с откатом частичных результатов относится к worker-runtime (Этап 7).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch analysis from inside the editor and see it finish (Priority: P1)

An analyst is working in a Python or Odoo project open in VS Code and wants fresh metrics on the current workspace. Instead of dropping to an external terminal, they invoke the extension's "Analyze Project" command from the command palette (or a sidebar entry). The extension starts the analysis through the CLI, surfaces live progress and status, and notifies the analyst when the run completes or fails — all without leaving the editor.

**Why this priority**: This is the entry point to the whole feature. Without the ability to trigger and observe an analysis run from inside the IDE, none of the subsequent stories (viewing results, configuring profile) have anything to act on. It delivers standalone value: "I can analyze my project without leaving the editor."

**Independent Test**: Open a workspace, run the command, and verify the analysis executes against the workspace (a `.duckdb`/results artifact is produced or updated) and a completion/failure status is reported — without ever opening the dashboard or a browser.

**Acceptance Scenarios**:

1. **Given** a Python/Odoo project is open in VS Code and the CLI is installed, **When** the analyst invokes the "Analyze Project" command, **Then** the extension starts the CLI against the current workspace root and reports that analysis is in progress.
2. **Given** an analysis run is in progress, **When** the analyst watches the status indicator, **Then** they see live progress updates (e.g. current commit / phase) sourced from the running CLI rather than a static spinner.
3. **Given** an analysis run completes successfully, **When** the CLI exits with a success status, **Then** the analyst receives a clear completion notification and the results become available for the dashboard.
4. **Given** the CLI fails (non-zero exit, missing dependency, or invalid workspace), **When** the run terminates, **Then** the analyst sees a readable error message with the failing output and is offered a way to retry or diagnose.
5. **Given** a workspace is not open (no folder), **When** the analyst invokes the command, **Then** the extension prevents or guides the run rather than executing against an undefined path.

---

### User Story 2 - View the analytics dashboard inside the editor (Priority: P2)

Once analysis has completed, the analyst wants to inspect the metrics without context-switching to a browser. They open the dashboard panel from the extension, and an embedded view renders the existing frontend (commit history, file metrics, top-N complexity, graph explorer) with the just-produced results delivered into the panel by the extension via a message bridge (no server is started). The panel behaves like a normal editor panel — it can be moved between the main, side, and bottom panel groups and reopened after closing.

**Why this priority**: This is where the value of staying in the IDE materializes — seeing the results. It depends on Story 1 having produced results, but once results exist it is independently demonstrable (open the panel against an existing analysis).

**Independent Test**: Given a workspace with a completed analysis, open the dashboard panel and confirm it renders the same reports the browser dashboard would, populated from the current workspace's results — without starting the standalone server manually.

**Acceptance Scenarios**:

1. **Given** a completed analysis exists for the current workspace, **When** the analyst opens the dashboard panel, **Then** the existing frontend renders inside the editor with the workspace's results delivered to it by the extension via a message bridge, and no server is started.
2. **Given** the dashboard panel is open, **When** the analyst interacts with it (filters, graph explorer, commit navigation), **Then** those interactions work equivalently to the browser dashboard because it is the same frontend reused, not a reimplementation.
3. **Given** the dashboard panel is open, **When** the analyst moves or docks the panel to another panel group, **Then** it continues to function and retain its state.
4. **Given** the dashboard panel was closed, **When** the analyst reopens it, **Then** it reloads against the current workspace's results.
5. **Given** no completed analysis exists yet, **When** the analyst opens the dashboard panel, **Then** they see a clear empty state with a path to run analysis (rather than a broken or blank view).
6. **Given** a new analysis run completes while the panel is open, **When** the analyst reloads the panel, **Then** the dashboard reflects the refreshed results.

---

### User Story 3 - Configure how the workspace is analyzed via extension settings (Priority: P3)

An analyst works across both plain Python projects and Odoo projects. They want to tell the extension which profile to use for the current workspace (e.g. `python` vs `odoo`) plus where results are stored, so that subsequent runs use the right interpretation without editing config files or passing flags every time. Settings can be set per-workspace or globally as a default.

**Why this priority**: It makes the extension usable across heterogeneous projects and removes repetitive manual configuration, but a single-profile team can still get value from Stories 1 and 2 with the default profile. Lower priority because the default (plain Python) is a reasonable starting point.

**Independent Test**: Set the profile for a workspace to `odoo`, run analysis, and confirm the run interprets the workspace as Odoo (Odoo-specific entities/relations appear in the dashboard); switch back to `python` and confirm plain-Python behavior returns.

**Acceptance Scenarios**:

1. **Given** the extension is installed, **When** the analyst opens the extension settings, **Then** they can choose the analysis profile for the current workspace (with `python` as the default).
2. **Given** a profile is set for the workspace, **When** the analyst runs analysis, **Then** the run uses that profile so Odoo workspaces are analyzed with Odoo semantics and plain Python workspaces with Python semantics.
3. **Given** the analyst sets a global default profile, **When** they open a workspace with no workspace-level override, **Then** the global default applies.
4. **Given** a workspace-level setting exists, **When** the analyst evaluates precedence, **Then** the workspace setting takes precedence over the global default.
5. **Given** the analyst sets a custom analysis/results directory for the workspace, **When** analysis runs, **Then** results are written to and read from that configured location.

---

### Edge Cases

- What happens when the CLI is not installed or not on the editor's PATH when the analyst invokes "Analyze Project"?
- What happens when a second analysis is invoked while one is already running for the same workspace?
- What happens when the analyst closes the editor or reloads the window mid-analysis — the spawned CLI process may be orphaned; on next launch the extension reports an apparently incomplete/cancellable run (basic cancel via FR-020, no result rollback).
- What happens when a cancelled run (FR-020) leaves a stale writer lock — the next analyze would be blocked unless the extension recovers it (FR-020 stale-lock recovery).
- What happens when the workspace contains no Git history or an empty repository?
- What happens when results from an older, incompatible analysis format are present — does the dashboard degrade or prompt a re-run?
- What happens when the results artifact is missing or was deleted, but the analyst opens the dashboard panel?
- What happens when the configured profile is not applicable to the workspace (e.g. `odoo` selected on a non-Odoo project)?
- What happens when the editor is opened with multiple workspace folders — which one is analyzed?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST expose a command that launches analysis against the currently open workspace root using the project's CLI.
- **FR-002**: The extension MUST surface live progress/status to the analyst while analysis is in progress, obtained by parsing the CLI's machine-readable progress stream (the `--json` contract of FR-019), not a static spinner.
- **FR-003**: The extension MUST notify the analyst clearly on analysis completion with a path to view the results.
- **FR-004**: The extension MUST surface readable error output (CLI stderr/exit context) when a run fails and offer a retry or diagnose action.
- **FR-005**: The extension MUST prevent or guide a run when no workspace folder is open.
- **FR-006**: The extension MUST allow only one analysis run per workspace at a time; if a run is already in progress, it MUST inform the analyst and offer the cancel action (FR-020) rather than silently blocking.
- **FR-007**: The extension MUST reuse the existing frontend dashboard rendered inside an embedded editor panel rather than reimplementing the UI.
- **FR-008**: The dashboard panel MUST receive the current workspace's analysis results (delivered into the panel by the extension via a message bridge, without running a server) and render the same reports (commit history, file metrics, top-N complexity, graph explorer) as the browser dashboard.
- **FR-018**: The dashboard panel MUST NOT require the FastAPI server to run; the extension MUST host the existing frontend bundle inside the panel and deliver results to it through a message bridge, so the same frontend bundle works in both browser mode (server-backed) and panel mode (message-backed).
- **FR-019**: The CLI's `analyze` command MUST accept a `--json` flag that emits a machine-readable stream of run/progress/result events (JSON-lines on stdout): run started, per-commit progress (processed/total, current short hash), and run completed/failed. The extension MUST consume this stream to satisfy FR-002 and SC-005. The stream MUST contain exactly one terminal event (`run_completed` or `run_failed`) per run; if the process exits without a terminal event, the extension MUST treat it as an unknown failure. When `--json` is set, the human-readable progress output MUST be suppressed in favor of the JSON-lines stream. This flag reuses the existing structured run state (`RunMeta`) and the existing JSON output patterns of `query`/`serve`; it MUST NOT alter analysis logic.
- **FR-020**: The extension MUST support cancelling an in-progress analysis run by terminating the spawned CLI process; the run status MUST transition to `cancelled`. Rollback of already-written results is out of scope for this stage (deferred to the worker runtime). After cancellation, the extension MUST ensure the workspace's writer lock is not left stale (e.g. by recovering via the CLI's stale-lock recovery path) so the next analysis run is not blocked by the cancelled run's lock.
- **FR-021**: When the store exists but is schema-incompatible with the current CLI, the extension MUST detect this (via the status/query contract) and prompt the analyst to re-run analysis with a rebuild rather than silently showing a broken dashboard.
- **FR-022**: The Webview message bridge MUST guarantee exactly one response per request correlation id; unmatched or duplicate responses MUST be surfaced as an error rather than silently dropped.
- **FR-023**: The dashboard panel MUST obtain data through a single long-lived, read-only CLI query process per open panel; the extension MUST NOT start a new CLI process per dashboard request, so that interactivity stays responsive and the Python/DuckDB cold-open is paid once per panel session.
- **FR-024**: The read-only query process MUST NOT acquire the writer lock and MUST NOT perform writes; any write-attempting request MUST be rejected. All writes remain exclusively on the `analyze` path through the existing single writer (Principle V).
- **FR-009**: The dashboard panel MUST be dockable into any editor panel group and retain functioning interactions after being moved.
- **FR-010**: The dashboard panel MUST show a clear empty state with a path to run analysis when no completed results exist.
- **FR-011**: The extension MUST let the analyst choose the analysis profile per workspace, with `python` as the default and `odoo` as an alternative.
- **FR-012**: Workspace-level settings MUST take precedence over global defaults for profile and results directory.
- **FR-013**: The extension MUST support a configurable analysis/results directory per workspace and use it for both writing (on run) and reading (in the dashboard).
- **FR-014**: The extension MUST resolve the Python CLI executable deterministically in a fixed precedence order: a configured Python interpreter (run as `<exe> -m ppi`), then a configured CLI path, then the `ppi` console script on PATH. The chosen resolution MUST be reproducible across runs, and the extension MUST tell the analyst (with a path to settings) when no executable can be found.
- **FR-015**: The extension MUST be a thin client: it MUST NOT own analysis logic or storage — all analysis and persistence MUST be delegated to the existing CLI and results store.
- **FR-016**: The extension MUST discover the project profile and results location through the existing CLI/configuration contract, not by re-implementing project configuration.
- **FR-017**: When multiple workspace folders are open, the extension MUST let the analyst select which folder to analyze (or analyze the primary folder with a clear indication), and MUST NOT silently run against an ambiguous target.

### Key Entities

- **Analysis Run**: a single invocation of the CLI against a workspace; carries status (queued, running, completed, failed, cancelled), live progress, and the workspace it targets.
- **Workspace Profile**: the per-workspace analysis interpretation (`python` | `odoo`) plus results-directory configuration; resolves with a global-default fallback.
- **Dashboard View**: the embedded instance of the existing frontend rendered in the editor, bound to a workspace's results; has its own panel lifecycle (open, docked, closed, reopened).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an open workspace, an analyst can go from "I want metrics" to "analysis completed" using only editor commands, without opening an external terminal or browser.
- **SC-002**: An analyst can open the results dashboard inside the editor and reach every existing dashboard capability (reports, graph explorer, commit navigation) within the embedded panel, with no capability missing relative to the browser dashboard.
- **SC-003**: The embedded dashboard is the same frontend bundle used in browser mode, differing only in its data source (message bridge instead of the server); an interaction that works in the browser also works in the panel (parity verified for filters, graph explorer, and commit navigation).
- **SC-004**: An analyst switching a workspace between `python` and `odoo` profiles can run analysis in each mode and observe the corresponding interpretation in the dashboard within one run of the CLI per switch.
- **SC-005**: Analysis progress and completion/failure are visible to the analyst within 2 seconds of the underlying event being emitted in the CLI's `--json` stream, so no run silently runs or finishes unnoticed.
- **SC-006**: A failed run produces a readable error with the failing output available to the analyst, so the analyst can diagnose or retry without leaving the editor.
- **SC-007**: 100% of the listed capabilities operate by orchestrating the existing CLI and reusing the existing dashboard, with no new analysis engine or storage introduced.
- **SC-008**: The dashboard panel is served by one long-lived read-only CLI query process per panel session; during a panel session, no new CLI process is started for individual dashboard reads (verifiable by observing exactly one `ppi rpc` process per open panel).

## Assumptions

- This feature builds on the existing CLI (commands like `analyze`/`serve`/`query` from earlier stages) and the existing frontend dashboard (React, rendered for the browser report). Those are the integration points; this stage adds only the IDE bridge, not new analysis or storage.
- The CLI is already installable as the `ppi` package and runnable in the analyst's environment; if it is not installed or not on the editor's PATH, the extension reports this and guides the analyst rather than silently failing.
- A machine-readable progress contract for `analyze` does not yet exist as a stdout stream: today `analyze` renders human-readable `click.progressbar` output and writes structured `RunMeta` plus optional `--jsonl` batches to disk. Adding the `--json` flag (FR-019) is therefore an incremental CLI change building on these existing structured outputs, not a new analysis subsystem.
- A single analysis run per workspace at a time is sufficient for this stage; richer concurrency, queueing, and worker-runtime ownership arrive in later stages (Stage 7+). The extension simply blocks/prevents a duplicate concurrent run rather than managing a queue.
- The "thin bridge" reuses the existing dashboard by hosting the same frontend bundle inside the IDE's webview; the dashboard is not rewritten for this stage. Results are delivered into the panel by the extension via a message bridge (postMessage); no FastAPI server is started for the panel. The frontend gains a thin results-ingest abstraction so the same bundle works in browser mode (server-backed) and panel mode (message-backed); this adapter is the only frontend change implied by this transport choice.
- To feed the panel without a server, the extension spawns one long-lived read-only CLI query process (`ppi rpc`) per open dashboard panel, which exposes the same read surface as `ppi serve` over a stdio JSON-RPC protocol; the extension bridges frontend reads to it via the message bridge. This is a read-only servant, NOT the Stage 7 worker: it performs no writes, owns no analysis, and its lifecycle is owned by the extension. No HTTP server endpoint is introduced for the panel; only the CLI's existing read surface (shared with `ppi serve`) and the frontend's results-ingest adapter are used.
- The configurable profiles are `python` (default) and `odoo`, matching the analysis profiles the CLI already understands; introducing new profiles is out of scope and handled by the plugin/profile work in later stages.
- The extension targets VS Code as the IDE host; the architecture keeps the bridge thin so the same approach can extend to Cursor later, but Cursor-specific work is out of scope here.
- Analysis run lifecycle when the editor is reloaded mid-run is best-effort in this stage: the spawned CLI process may be orphaned, and on next launch the extension reports whether a previous run appears incomplete and offers basic cancel (FR-020). Rollback of partial results and robust process supervision belong to the worker runtime (Stage 7).
- Persisting extension settings (profile, results directory) uses the editor's standard settings mechanism with workspace-over-global precedence.
