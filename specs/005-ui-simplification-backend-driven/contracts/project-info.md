# Contract: `GET /api/project/info`

**Endpoint**: `GET /api/project/info`
**RPC method**: `project/info`

## Request

No parameters.

## Response: `ProjectInfoResponse`

```python
class ProjectInfoResponse(BaseModel):
    project_id: str
    repo_path: str | None
```

## Notes

- Заменяет `fetchStatus` в `SnapshotPage` (только project metadata: `project_id`, `repo_path`).
- `run_failures` не отдаются (удалены из UI); status-диагностика переходит на CLI `doctor`.
- `GET /api/status` удалён полностью.