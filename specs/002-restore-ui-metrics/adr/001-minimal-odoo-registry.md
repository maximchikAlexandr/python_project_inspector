# ADR 001: Minimal Odoo Profile Binding for Restored UI

**Status**: Accepted  
**Date**: 2026-06-20  
**Context**: FR-025 requires registry-driven UI shells. Feature 002 restores Odoo-specific report surfaces on the history-aware foundation.

## Decision

Ship the restored UI with a **minimal profile module** (`frontend/src/registry/odooProfile.ts`) that exports:

- line category keys and labels
- brightness criteria keys and labels
- edge category keys
- pure helpers (`lineCategoryTotal`, `computeNodeBrightnessMap`)

Components import this module directly. There is **no runtime profile switcher** and **no pluggy-style registry** in v1.

## Rationale

- Old-tool parity targets the Odoo profile only; a generic Python profile does not need these surfaces.
- Feature 001 deferred the backend plugin registry; duplicating that on the frontend would expand scope without a second active profile.
- Constants + helpers satisfy the spirit of FR-025: Odoo data flows through profile parameters, not hard-coded field names scattered across components.

## Consequences

- Adding a second profile later requires extracting `odooProfile.ts` into a registry loader without rewriting graph/treemap shells.
- Reviewers should treat direct `odooProfile` imports as intentional until a second profile is specified.
