# HTTP API Contract (FastAPI) — Dashboard backend

Served by `serve` (FR-016..FR-021). Read-only over the project's DuckDB store. Pydantic is used only here, at the FastAPI boundary; everything below the boundary uses the `msgspec` contracts. All responses are JSON; all reads are ordered by `commit_order` where time-series is implied.

Base path: `/api`.

## `GET /api/status`
Analysis/store status for the status view (FR-020).

```json
{
  "project_id": "example-repo",
  "branch": "dev",
  "schema_version": 1,
  "expected_schema_version": 1,
  "schema_compatible": true,
  "store_present": true,
  "writer_active": false,
  "last_run": {
    "run_id": "…", "mode": "incremental", "status": "completed",
    "commits_total": 453, "commits_succeeded": 451, "commits_failed": 2,
    "started_at": 0, "finished_at": 0
  },
  "commit_count": 453
}
```
If a writer holds the lock, `writer_active: true` and time-series endpoints may return `409` with `{"detail": "analysis in progress"}`.

## `GET /api/catalog`
Selectable module or file names for dashboard filters.

Query params: `level=module|file` (required), `limit` (default 5000).

```json
{"level": "module", "names": ["sale_extended", "demo_module"]}
```

## `GET /api/commits`
Ordered commit timeline (axis for charts).

```json
[{"commit_hash": "…", "commit_order": 0, "authored_at": 0, "summary": "…"}]
```

## `GET /api/metrics/timeseries`
Complexity/size over time, per file or per module (FR-017/FR-019).

Query params: `level=module|file` (required), `metric=cyclomatic|cognitive|jones|lines` (required), `name=<module or path>` (required), `agg=mean|median|p95|max` (default `mean`, ignored for `lines`).

```json
{
  "level": "module", "metric": "cyclomatic", "agg": "mean",
  "series": [
    {"name": "sale_extended",
     "points": [{"commit_order": 0, "commit_hash": "…", "value": 3.2}]}
  ]
}
```

## `GET /api/hotspots`
Top-N files/modules by current complexity and by growth (FR-018).

Query params: `level=module|file`, `metric=cyclomatic|cognitive|jones`, `by=value|growth` (default `value`), `limit` (default 20).

```json
{"by": "growth", "items": [
  {"name": "sale_extended/models/sale.py", "current": 18.0, "first": 4.0, "growth": 14.0}
]}
```

## `GET /api/structure/timeseries`
Coupling structure change over commit history (US3 structure-over-time narrative).

```json
{"points": [
  {"commit_order": 0, "commit_hash": "…", "edge_count": 3, "total_score": 12}
]}
```

## `GET /api/edges`
Coupling edges at a commit (defaults to latest) for the structure view.

Query params: `commit=<hash>` (optional; default latest), `min_score` (default 1).

```json
{"commit_hash": "…",
 "edges": [{"source": "a", "target": "b", "score": 12, "kinds": {"python__inherit": 3}}]}
```

## Errors
- `404` unknown module/file/commit name.
- `409` `{"detail": "analysis in progress"}` when the store is locked by a writer.
- `422` invalid/missing query params (FastAPI validation).
- `503` `{"detail": "store not found"}` when no analysis has been run yet.
