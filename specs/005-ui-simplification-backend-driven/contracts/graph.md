# Contract: `GET /api/graph`

**Endpoint**: `GET /api/graph?commit=...&include_zero_score=false`
**RPC method**: `graph`

## Request

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| commit | str | No | latest | commit hash |
| include_zero_score | bool | No | false | include zero-score edges |

## Response: `GraphResponse`

```python
class GraphNodeResponse(BaseModel):
    module_name: str
    metrics: dict[str, float]    # metric id -> value (from catalog)
    line_counts: dict[str, int]  # line category id -> count

class EdgeResponse(BaseModel):
    source: str
    target: str
    score: int
    kinds: dict[str, int]                     # relation_type_id -> count
    kind_occurrence_count: int = 0
    breakdown: dict[str, int] | None = None    # relation_type_id -> graph-point count
    commit_hash: str

class GraphResponse(BaseModel):
    commit_hash: str
    nodes: list[GraphNodeResponse]
    edges: list[EdgeResponse]
```

## Notes

- Путь endpoint'а не меняется (REST API перерабатывается в отдельной задаче).
- Node contract generic: `metrics`/`line_counts` из storage JSON-колонок; Odoo-specific поля (`python_file_count`, `method_count`, `cyclomatic_median`, `cognitive_median`, `jones_median`, `score_in`, `score_out`, `line_categories`) удалены.
- Edge contract generic: `kinds`/`breakdown` — `dict[str, int]` (keys=`relation_type_id`); `EdgeBreakdownResponse` удалён; evidence-поля (`evidence_count`, `why_points`, `source_quote`) удалены.
- Frontend (`ModuleGraph`, `graphViewModel`, `graphSelectors`) использует generic metric access по id из `ui/config`; если metric id неизвестен для node/edge, значение считается `0`.
- Edge labels строятся из `ui/config.graph.edge_types` label, а не из локального словаря.