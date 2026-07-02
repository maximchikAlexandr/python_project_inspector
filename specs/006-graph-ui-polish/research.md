# Research: Graph UI Polish and Tables Reorganization

## Decision 1: Keep the existing React/Mantine UI stack

**Decision**: Implement this feature using the existing React + TypeScript + Vite + Mantine frontend stack.

**Rationale**: The feature is a polish/reorganization patch, not a design-system migration. The current project already uses Mantine components, React state, Vite builds, and Vitest tests. Replacing the design system would expand scope beyond the spec.

**Alternatives considered**:

- Replace Mantine with another UI kit: rejected as out of scope.
- Build custom components for all controls: rejected because existing components are sufficient.

## Decision 2: Introduce a dedicated top-level Tables page instead of nested table accordions

**Decision**: Large module and relation tables move to a top-level `Tables` tab that shares selected commit/snapshot state with the Report page.

**Rationale**: This directly reduces visual noise on the graph page while preserving access to analytical table data. Sharing snapshot state prevents conflicting interpretations between graph and tables.

**Alternatives considered**:

- Keep compact links from Report to Tables: rejected by clarification; Report should not keep table-specific shortcuts.
- Keep table accordions collapsed on Report: rejected because it does not actually remove visual/structural complexity.

## Decision 3: Preserve safe table preferences but reset content-specific table state on snapshot change

**Decision**: Keep sorting, visible columns, and page size across snapshot changes; reset selected module and file drilldown when the snapshot changes.

**Rationale**: Display preferences are safe to preserve, while module/file selections may become invalid for a different snapshot.

**Alternatives considered**:

- Reset all state: too disruptive.
- Preserve all state: risks stale selections.

## Decision 4: Edge labels are config-driven with frontend readable fallback

**Decision**: Use backend/config-provided edge labels. If missing, frontend generates a readable fallback from the stable key.

**Rationale**: Keeps UI backend/plugin-driven while preventing raw `snake_case` from appearing in normal UI.

**Alternatives considered**:

- Hardcode labels in frontend: rejected because it reintroduces domain knowledge.
- Hide unlabeled edge types: rejected because it can hide valid graph data.

## Decision 5: Graph recovery happens after user interaction completes

**Decision**: Detect empty viewport after pan/drag/zoom ends and recover graph to visible bounds then.

**Rationale**: Immediate recovery during drag would fight user gestures. Delayed recovery after interaction preserves control while preventing users from staying lost.

**Alternatives considered**:

- Continuous hard clamp: too restrictive.
- Manual Fit only: insufficient for the reported issue.

## Decision 6: Bounded pan uses permissive viewport padding

**Decision**: Allow graph movement beyond graph bounds up to roughly 30-50% viewport padding.

**Rationale**: This gives enough room to inspect edge nodes while preventing infinite empty canvas movement.

**Alternatives considered**:

- Exact graph bounding-box clamp: too rigid.
- No pan bounds: leaves users vulnerable to empty-canvas states.

## Decision 7: Dashboard selection validity is enforced before requests

**Decision**: Metrics Dashboard recomputes valid targets and metrics when level changes and avoids requests until selection state is valid.

**Rationale**: The current UI can send module targets to file-level queries or unsupported metrics to the backend. This causes avoidable 422/500 responses.

**Alternatives considered**:

- Let backend return friendly errors: improves messaging but still sends invalid requests.
- Block with warning only: safer but slows normal flow.

## Decision 8: Commit date display uses fixed local format

**Decision**: Render commit date in browser local timezone using `YYYY-MM-DD HH:mm`.

**Rationale**: This is compact, explicit, stable in screenshots/tests, and user-readable.

**Alternatives considered**:

- Browser locale formatting: natural but less stable.
- UTC: precise but less user-friendly.
