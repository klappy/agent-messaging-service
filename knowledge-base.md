---
uri: ams://knowledge-base
title: "AMS Knowledge Base — Overlay on klappy.dev"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "knowledge-base", "overlay", "governance", "oddkit"]
epoch: E0008.3
date: 2026-05-01
derives_from: "klappy://canon/constraints/core-governance-baseline, klappy://canon/principles/consistency-same-pattern-every-time"
governs: "How agent-messaging-service contributes canon to oddkit consumers; the relationship between this overlay and the klappy.dev baseline"
status: active
---

# AMS Knowledge Base — Overlay on klappy.dev

> This repository carries an oddkit overlay. The upstream baseline is klappy.dev. AMS-specific decisions, constraints, and principles live here. Anything cross-program lives upstream and is referenced, not duplicated.

## How to Use This Overlay

Pass `knowledge_base_url=https://github.com/klappy/agent-messaging-service` to any oddkit tool to make this overlay's canon discoverable alongside the upstream klappy.dev baseline. With strict mode (the default when an overlay is set), the search corpus is overlay + required-baseline. Use `include_full_baseline=true` to merge the full upstream baseline into a single search.

## What Lives Here

```
canon/
  decisions/    Numbered, dated decisions specific to AMS (D0001…)
  constraints/  Wire-conformance, design constraints, operating rules
  principles/   Reusable principles AMS leans on or contributes
docs/           Pointers and overlay-specific operational notes
journal/        DOLCHE+E TSV encodings (already present pre-overlay)
```

The product-spec narrative lives at the repo root: `README`, `SPEC`, `AMS`, `PROTOCOL`, `ARCHITECTURE`, `POC-INFRA`, `POC-PLAN`, `ESSAY`, `GLOSSARY`, `HORIZON`, `PATTERNS`. Those are governed by `SPEC.md` §14 revision discipline. The canon/ tree extracts the load-bearing constraints and decisions from those narrative docs and adds the missing convention canon for the v1 use case. It does not duplicate them.

## What Lives Upstream

Cross-program canon — `vodka-architecture`, `definition-of-done`, `mode-discipline-and-bottleneck-respect`, `dry-canon-says-it-once`, the model operating contract, the writing canon, the AI voice clichés constraint, the canon article template — lives at `https://github.com/klappy/klappy.dev` and is referenced from this overlay via `klappy://` URIs. Per `klappy://canon/principles/dry-canon-says-it-once`, restating upstream canon here would be a drift surface, not a strengthening one.

## Authorship Discipline

Every canon file in this overlay:

1. Uses the frontmatter shape from `klappy://canon/template` (uri, title, audience, exposure, tier, voice, stability, tags, epoch, date, derives_from, governs, status). The `uri` namespace is `ams://` for AMS-original canon; `klappy://` is reserved for the upstream baseline.
2. Has been voice-checked against `klappy://canon/constraints/ai-voice-cliches` before commit.
3. Includes a "What this is not" or equivalent dogma-avoidance section per the canon template.
4. Cross-references via `klappy://` and `ams://` URIs rather than relative file paths, so links survive overlay/baseline merging in oddkit.

Tier assignments follow the upstream convention: Tier 1 for irreversible / load-bearing constraints, Tier 2 for evolving conventions that the implementation may force revisions to.

## What Counts as Done for the Overlay

The overlay is in good shape when:

- A reader who knows oddkit can run `oddkit_search` with this overlay's URL and find the AMS-specific decisions, constraints, and conventions without having to read the long-form spec docs.
- Every load-bearing decision in the long-form spec docs has a canon counterpart that is shorter, more rule-shaped, and addressable by URI.
- The two-conversational-AI-assistants use case (the SPEC §3.2 demo gate) is covered by canon convention articles that an implementer can read before building, not just discover after they hit the failure mode.

## See Also

- `klappy://canon/template` — the canon article shape
- `klappy://canon/constraints/core-governance-baseline` — three-tier resolution contract
- `klappy://canon/principles/consistency-same-pattern-every-time` — same MCP, every overlay
- `SPEC.md` §14 — revision discipline for the long-form spec docs
