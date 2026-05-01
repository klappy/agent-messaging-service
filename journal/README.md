# Journal

DOLCHE artifacts encoding the foundational decisions, constraints, learnings, observations, opens, handoffs, and naming for AMS.

Format: TSV files, one per encoding session. Each row is one artifact.

Vocabulary (per [klappy://canon/definitions/dolcheo-vocabulary](https://oddkit.klappy.dev/canon/definitions/dolcheo-vocabulary)):

| Letter | Type | Meaning |
|--------|------|---------|
| **D** | Decision | A choice made and committed. |
| **C** | Constraint | A boundary the project must respect. |
| **L** | Learning | An insight extracted from experience. |
| **O** | Observation | Something seen. May be open (`facet=open`) or closed. |
| **H** | Handoff | State or task being passed forward. |
| **E** | Encode | A naming or definitional capture. |

Quality scores come from oddkit's encode evaluation (`weak | adequate | strong`), out of the type's max score.

## Files

- [`2026-05-01-ams-foundation.tsv`](./2026-05-01-ams-foundation.tsv) — 26 artifacts encoding the foundational AMS design dialogue. Source: design conversation with Claude on May 1, 2026, post documentation phase, pre PoC implementation.
- [`2026-05-01-ams-orchestration-foundation.tsv`](./2026-05-01-ams-orchestration-foundation.tsv) — 9 artifacts capturing the spec-vs-instance layering, the deterministic harness pattern, and the intranet-vs-internet framing. Adds PATTERNS.md as the documented surface for emergent patterns built on AMS.
- [`2026-05-01-ams-metadata-and-capabilities.tsv`](./2026-05-01-ams-metadata-and-capabilities.tsv) — 5 artifacts encoding the metadata/capabilities/annotations design: streams and conversations carry a generic metadata slot, `capabilities` is the one well-known key, all other keys are annotations, and capability negotiation lives in the agents rather than the protocol. Collapses a previously-deferred sister-spec into a small wire extension.
- [`2026-05-01-ams-dream-house-edge-wrappers.tsv`](./2026-05-01-ams-dream-house-edge-wrappers.tsv) — 6 artifacts encoding the dream-house-wire / edge-wrapper architectural separation: the wire stays push-native and unchanged regardless of which runtimes consume it, and runtime adaptation lives in per-session edge wrappers (the MCP SessionDO is the canonical instance). Adds PATTERNS.md §2.

## Provenance

These artifacts were produced by `oddkit_encode` and persisted manually in lieu of a TruthKit harness or GitHub MCP automation. Future entries should ideally land via the same path.
