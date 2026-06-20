# Quickstart & Validation: Restore Lost UI & Metrics Parity

Runnable validation scenarios proving the restored metrics, snapshot reads, the `ppi` rename, and the in-project `.ppi/` store. See `contracts/` and `data-model.md` for exact shapes; this guide is run/validation only.

## Prerequisites

- Python 3.11+, Node 18+ (for the frontend), Git.
- Install the renamed package: `pip install -e .` → exposes the `ppi` console command (the old `python-project-inspector` command must be gone).
- A fixture Odoo repo (small, committed).

## Scenario 1 — Rename takes effect (FR-032..FR-034)

```bash
pip install -e .
ppi --help
python -c "import ppi; print(ppi.__name__)"
! command -v python-project-inspector            # old command absent
! python -c "import python_project_inspector"    # old import fails
```
Expected: `ppi` runs; `import ppi` works; old console script and old import both fail.

## Scenario 2 — In-project `.ppi/` store + self-ignore (FR-035, E1)

```bash
ppi --repo <fixture> analyze --all-modules
ls <fixture>/.ppi/history.duckdb        # store created in-project
cat <fixture>/.ppi/.gitignore           # single line: *
git -C <fixture> status --porcelain | grep -q ".ppi" && echo "TRACKED (bad)" || echo "ignored (ok)"
```
Expected: store at `<fixture>/.ppi/history.duckdb`; `.ppi/.gitignore` contains `*`; `.ppi` is untracked. Worktree/lock remain under the user-level analysis dir (not in `<fixture>`).

## Scenario 3 — Recovered metrics persisted (FR-009..FR-016)

```bash
ppi --repo <fixture> query --metric modules --commit <hash> --format json
ppi --repo <fixture> query --metric module-detail --module <mod> --format json
ppi --repo <fixture> query --metric file-detail --file <mod>/<rel> --format json
```
Expected: module rows include `python_file_count`, `declared_models[]`, `inherited_models[]`, in-scope `manifest_depends[]`, per-category lines, and complexity distributions; file detail includes `top_folder`. `python_file_count` counts production Python files only (not tests/manifest).

## Scenario 4 — Edge breakdown + evidence, no source quote (FR-013, Clarifications)

```bash
ppi --repo <fixture> query --metric graph --commit <hash> --format json
ppi --repo <fixture> query --metric edge-points --source <S> --target <T> --format json
```
Expected: each edge has `breakdown{model_reuse,extension_or_method,view,field_property,total}` with `total == score`; edge-points returns per-category points and `evidence[]` rows of `{kind, file_path, line, detail}` with **no** source-quote field.

## Scenario 5 — Module scope filtering persists (FR-040, D5)

```bash
ppi --repo <fixture> analyze --module-prefix sale_ --include-module account --rebuild
ppi --repo <fixture> query --metric modules --format json   # only in-scope modules
ppi --repo <fixture> analyze --all-modules                  # scope conflict without --rebuild
```
Expected: only `sale_*` and `account` modules analyzed; re-running with a different scope is rejected unless `--rebuild`; in-scope `manifest_depends` only reference in-scope modules.

## Scenario 6 — Consistency fixes (FR-027, hotspots agg)

```bash
ppi --repo <fixture> query --metric edges --format json
ppi --repo <fixture> query --metric edges --include-zero-score --format json
ppi --repo <fixture> serve --port 8765 &
curl 'http://127.0.0.1:8765/structure/timeseries'
curl 'http://127.0.0.1:8765/edges?include_zero_score=false'
curl 'http://127.0.0.1:8765/hotspots?metric=cyclomatic&agg=p95'
```
Expected: the structure-chart edge count equals the number of edges returned by `/edges` for the same `include_zero_score` setting; `/hotspots` honors `agg` (p95 differs from mean when data varies).

## Scenario 7 — Snapshot + series API (FR-039, D9/D11)

```bash
curl 'http://127.0.0.1:8765/snapshot/modules?commit=<hash>'
curl 'http://127.0.0.1:8765/graph?commit=<hash>'
curl 'http://127.0.0.1:8765/metrics/timeseries?level=module&metric=lines_by_category&name=<mod>'
curl 'http://127.0.0.1:8765/metrics/timeseries?level=module&metric=python_file_count&name=<mod>'
curl 'http://127.0.0.1:8765/relations/diff?commit_a=<h1>&commit_b=<h2>'
```
Expected: the same data reachable via CLI `query` is reachable via HTTP (parity).

## Scenario 8 — Restored interactive UI (FR-021..FR-031, E2)

```bash
cd frontend && npm install && npm run build && cd ..
ppi --repo <fixture> serve --port 8765 --open
```
Validate in the browser:
- Force-directed module graph with edge thickness by points and node brightness toolbar (old-tool parity).
- Line-category toolbar toggling python/js/test/xml/css/html.
- Module detail and file detail panels; file treemap.
- Module-code-lines table and Python-file-complexity table.
- Edge-points table showing per-category points + evidence (kind/file/line/detail).
- Manifest dependency view; parse/failure view.
- A commit selector drives every snapshot surface.
- UI surfaces come from the entity/metric/edge registry parameterized by the `odoo` profile (no hard-wired Odoo strings in components).

## Scenario 9 — Schema v2 / no migration (D6)

```bash
ppi --repo <fixture> doctor    # reports schema_version=2, .ppi writable
```
Expected: a v1 store opened by the v2 package surfaces a schema-incompatibility error instructing `analyze --rebuild`; a fresh `.ppi/` store reports `schema_version=2`.

## Automated tests to add

- `tests/unit`: `edge_breakdown` group math; `top_folder` derivation; `python_file_count`; `Evidence` round-trip via `batch_to_json`/`batch_from_json`; scope normalization.
- `tests/contract`: schema v2 DDL + writer inserts for new tables/columns; CLI `query` new metrics; API new endpoints + extended `/edges`/`/hotspots`.
- `tests/integration`: analyze fixture → snapshot reads match expected evidence/breakdown/model lists; edge-inclusion rule parity (chart vs table); scope filtering + persistence; `.ppi/` placement and `.gitignore` creation; rename (no old import/command).
