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
- [`2026-05-01-ams-gauntlet-and-spec-lock.tsv`](./2026-05-01-ams-gauntlet-and-spec-lock.tsv) — 3 artifacts capturing the oddkit gauntlet pass (orient → preflight → challenge → gate) on the PoC plan and the resulting consolidation: SPEC.md becomes the single locking surface, deeper docs are the reference layer, and the revision discipline is documented.
- [`2026-05-01-ams-horizon-and-token-stream-routing.tsv`](./2026-05-01-ams-horizon-and-token-stream-routing.tsv) — 4 artifacts capturing two related moves: the canonical one-line description of AMS becomes "Token stream routing." (vodka-correct, function-not-consumer), and the durable-thread vision is documented as HORIZON.md (the dream the spec is the first move toward, kept separate from SPEC.md so vision and contract don't bleed into each other). Includes the wedge insight (felt pain is dropped connections, category shift is multi-agent) and the open watch item on native model-provider resumption. Also includes the later reshape of HORIZON from essay to comprehensive use-case catalog, plus the §5 Transformation/Encoding/Artifact Projection and §11 Composition additions.
- [`2026-05-01-ams-horizon-as-constraint-set.tsv`](./2026-05-01-ams-horizon-as-constraint-set.tsv) — 4 artifacts encoding the catalog reframe: HORIZON is two-sided (dream half + constraint half — a v1 decision that forecloses any catalog entry is wrong), comprehensive enumeration enables decisive scoping rather than overwhelming it, event-driven orchestration is added as §3.7 (the inversion of the dominant orchestrator-agent pattern), and "missing link" naming is established as AMS's strategic position. SPEC.md §14 updated to encode the forward-compatibility check against HORIZON.md as part of revision discipline.
- [`2026-05-01-ams-long-game-distributed-moe.tsv`](./2026-05-01-ams-long-game-distributed-moe.tsv) — 4 artifacts encoding the long-game vision: distributed mixture of experts at the SOTA level across providers (HORIZON §13.1), conversations as training corpus for dynamically-spawned specialized model subscribers like HRMs (§13.2), and a three-tier subscriber stack composed per-turn per-subtask (frontier + specialized + deterministic, §13.3). Includes the structural democratization claim (the composition primitive frontier labs use internally becomes available on an open substrate) and the forward-compat audit confirming PoC scope does not foreclose any of this.
- [`2026-05-01-canon-overlay-bootstrap.tsv`](./2026-05-01-canon-overlay-bootstrap.tsv) — 14 artifacts encoding the canon overlay bootstrap: layout decision (overlay rooted at `canon/`, accessed via `knowledge_base_url`), discipline (extract load-bearing constraints from long-form docs rather than rewrite them; `ams://` for AMS-original URIs, `klappy://` for upstream), tier conventions (Tier 1 irreversible, Tier 2 evolving), the recommended-not-prescriptive stance for the two-agent conversation conventions, and two open observations carrying forward (canon-integration audit not yet automated, conventions unproven by second implementation).

## Provenance

These artifacts were produced by `oddkit_encode` and persisted manually in lieu of a TruthKit harness or GitHub MCP automation. Future entries should ideally land via the same path.
