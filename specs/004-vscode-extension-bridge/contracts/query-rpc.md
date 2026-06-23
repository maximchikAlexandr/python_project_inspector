# Contract: `ppi rpc` stdio JSON-RPC (read-only query servant)

**Owner**: `ppi.query.dispatch` + `ppi rpc` command (Python); `queryBridge.ts` (TypeScript client).
**Spec ref**: FR-008, FR-015, FR-018, SC-003.

## Command

```
ppi rpc [--profile python|odoo] [--analysis-dir DIR]
```

Starts a long-lived **read-only** process that speaks JSON-RPC over **stdin/stdout**:
- Each line on stdin is one `RpcRequest` JSON object.
- Each response is one `RpcResponse`/`RpcError` JSON object on stdout (line-delimited).
- stderr is reserved for server-side diagnostics/logging (not protocol).
- The process exits on stdin EOF or an `rpc.close` notification.

The servant opens the `StoreReader` lazily/once per store and reuses it across requests (no per-request cold-open). It never writes; it never acquires the writer lock. If the writer lock is busy, read endpoints either return `LOCKED` or serve last-known reads per existing `ppi serve` semantics (decided in tasks; default: serve reads, mirror `ppi serve`).

## Request

```json
{"id":1,"method":"status","params":{}}
```
- `id`: integer correlation id (client-assigned, monotonically increasing).
- `method`: closed set mirroring dashboard `/api` endpoints — see `cli-query-surface.md`.
- `params`: object; shape per method (query params: `commit`, `level`, `metric`, `name`, `agg`, `source`, `target`, `include_zero_score`, `commit_a`, `commit_b`, `limit`, ...).

## Response (success)

```json
{"id":1,"result":{ ... }}
```
`result` is the exact JSON the corresponding `ppi serve` `/api/<method>` endpoint returns (same schema, same field names) — verified by a parity contract test.

## Error

```json
{"id":1,"error":{"code":"QUERY_NOT_FOUND","message":"commit abc not found"}}
```
Error codes (closed enum): `METHOD_NOT_FOUND`, `INVALID_PARAMS`, `STORE_NOT_FOUND`, `SCHEMA_INCOMPATIBLE`, `QUERY_NOT_FOUND`, `LOCKED`, `INTERNAL`.

## Notification (client → server, no response)

```json
{"method":"rpc.close"}
```
Clean shutdown (also happens on stdin EOF).

## Parity guarantee

`ppi rpc` and `ppi serve` route through the **same** `ppi.query.dispatch(reader, method, params)` function. A contract test asserts identical JSON for every method over a fixture store. This is the mechanism behind SC-003.

## Python struct sketch (msgspec)

```python
class RpcRequest(msgspec.Struct): id: int; method: str; params: dict
class RpcResponse(msgspec.Struct): id: int; result: Any
class RpcErrorBody(msgspec.Struct): code: str; message: str
class RpcError(msgspec.Struct): id: int; error: RpcErrorBody
```
