# Contract: CLI query surface — `/api` endpoint ↔ RPC method ↔ `StoreReader`

**Owner**: `ppi.query.dispatch`. **Spec ref**: FR-008, FR-016, SC-002, SC-003.

The dashboard uses these reads. `method` is the RPC method name (= `/api` path tail). `ppi rpc` exposes all; `ppi serve` exposes the same via HTTP. The dispatcher maps each to a `StoreReader` call.

| method | params | StoreReader call | In `ppi query` today? |
|--------|--------|------------------|------------------------|
| `status` | `{}` | `get_project`, `commit_count`, `last_run`, `failures_for_run` + lock check | no (add) |
| `commits` | `{}` | `commits()` | no (add) |
| `catalog` | `{level, limit?}` | `list_module_names` / `list_file_names` | no (add) |
| `metrics/timeseries` | `{level, metric, name?, agg}` | `module_*_timeseries` / `file_*_timeseries` | partial (add full) |
| `hotspots` | `{level, metric, agg, by, limit?}` | `hotspots(...)` | no (add) |
| `structure/timeseries` | `{include_zero_score?}` | `coupling_structure_timeseries` | no (add) |
| `edges` | `{commit?, include_zero_score?}` | `edges_at_commit` | yes |
| `snapshot/modules` | `{commit?}` | `modules_at_commit` | yes (`modules`) |
| `snapshot/files` | `{commit?, module?}` | `files_at_commit` | yes (`files`) |
| `snapshot/module/{name}` | `{name, commit?}` | `module_detail` | yes (`module-detail`) |
| `snapshot/file` | `{module, file, commit?}` | `file_detail` | yes (`file-detail`) |
| `graph` | `{commit?, include_zero_score?}` | `graph_at_commit` | yes (`graph`) |
| `edge-points` | `{source, target, commit?, include_zero_score?}` | `edge_points` | yes (`edge-points`) |
| `edge-points/batch` (POST) | `{pairs:[(s,t)], commit?, include_zero_score?}` | `edge_points_batch` | no (add via RPC/server) |
| `edge-evidence` | `{source, target, commit?, include_zero_score?}` | `edge_evidence_for_pair` | yes (`edge-evidence`) |
| `models` | `{module, commit?}` | `module_models` | yes (`models`) |
| `depends` | `{module?, commit?}` | `manifest_depends` | yes (`depends`) |
| `failures` | `{commit?}` | `failures_at_commit` | yes (`failures`) |
| `edge-kinds/timeseries` | `{kind?}` | `edge_kind_timeseries` | yes (`edge-kinds`) |
| `relations/diff` | `{commit_a, commit_b}` | `relations_diff` | yes (`relations-diff`) |

**Parity contract test**: for each method, over a fixture store, `ppi rpc` JSON == `ppi serve` `/api/<path>` JSON (field names and values equal). `edge-points/batch` is a POST in HTTP and a `post`-style RPC method (params carry `pairs`).

**Note**: `ppi query`'s existing one-shot metrics remain available; the new `ppi rpc` is the parity-complete surface used by the Webview. Whether to also expand `ppi query`'s metric set is optional and deferred (not required for the bridge).
