# Contract: `ppi analyze --json` progress stream

**Owner**: `ppi.runtime.progress` (Python `msgspec`) + `analyzeRunner.ts` (TypeScript consumer).
**Spec ref**: FR-002, FR-019, SC-005.

## Command

```
ppi analyze [--json] [--jsonl PATH] [--rebuild] [--profile python|odoo] ...
```

When `--json` is set:
- Emit newline-delimited JSON events on **stdout** (one JSON object per line).
- **Suppress** the human `click.progressbar` and the final summary lines.
- `--jsonl` (batch file output) is orthogonal and unchanged.
- Analysis logic, writer lock, and `RunMeta` persistence are unchanged (FR-019).

Without `--json`, output is bit-for-bit the current terminal output.

## Event wire format

Each line is a JSON object with a `type` discriminator (msgspec tagged union).

### `RunStarted`
```json
{"type":"run_started","run_id":"<uuid>","branch":"main","mode":"incremental","commits_total":412}
```
- `commits_total` may be `0` until the walk computes it; if unknown at start, emit `0` and correct via the first `CommitProgress`.

### `CommitProgress`
```json
{"type":"commit_progress","processed":7,"commits_total":412,"short_hash":"a1b2c3d4"}
```
- Emitted once per processed commit (the extension may throttle UI updates).
- Invariant: `0 <= processed <= commits_total`.

### `RunCompleted`
```json
{"type":"run_completed","run_id":"<uuid>","commits_succeeded":410,"commits_failed":2,"duration_ms":18320}
```
- Terminal event. Replaces today's final summary echo.

### `RunFailed`
```json
{"type":"run_failed","run_id":"<uuid>","exit_reason":"cli_error","message":"SchemaIncompatibleError: ...","stderr_tail":"...last lines..."}
```
- Terminal event. `stderr_tail` is the trailing lines of stderr (capped, e.g. last 2000 chars) for diagnosis (SC-006).
- `exit_reason` is a closed enum: `cli_error`, `schema_incompatible`, `lock_busy`, `bad_workspace`, `unknown`.

## Ordering

```
run_started → commit_progress* → (run_completed | run_failed)
```
Exactly one terminal event. The extension treats process exit with no terminal event as `unknown` failure.

## Python struct sketch (msgspec)

```python
class RunStarted(msgspec.Struct, tag="run_started"): ...
class CommitProgress(msgspec.Struct, tag="commit_progress"): ...
class RunCompleted(msgspec.Struct, tag="run_completed"): ...
class RunFailed(msgspec.Struct, tag="run_failed"): ...
ProgressEvent = Annotated[Union[...], msgspec.Tag]
```

Emitted via `msgspec.json.encode(event)` + `"\n"` on stdout (buffered, line-flushed per event).
