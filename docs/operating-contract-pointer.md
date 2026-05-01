---
uri: ams://docs/operating-contract-pointer
title: "Operating Contract Pointer — For LLM Agents Working on This Repository"
audience: docs
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "docs", "operating-contract", "llm", "bootstrap", "pointer"]
epoch: E0008.3
date: 2026-05-01
derives_from: "klappy://canon/bootstrap/model-operating-contract"
governs: "Any LLM agent (the model, GPT, Gemini, Llama, etc.) operating on the agent-messaging-service repository under oddkit governance."
status: active
---

# Operating Contract Pointer — For LLM Agents Working on This Repository

> The full model operating contract lives upstream at `klappy://canon/bootstrap/model-operating-contract`. This pointer document tells agents working on the AMS repo specifically what to read first and what overlay-specific canon to know about. It does not duplicate the upstream contract.

## Read First, In This Order

On the first substantive turn of any session working on this repository:

1. **`klappy://canon/bootstrap/model-operating-contract`** — the full operating contract. Time discipline, mode discipline, bottleneck respect, search-canon-before-asking. All of this applies unchanged.
2. **`ams://knowledge-base`** — the AMS overlay's own root pointer. Explains the overlay structure and what lives where.
3. **This document.** A quick map of what AMS-specific canon to be aware of.

After that, search and orient as the work demands. Do not skip the upstream bootstrap; AMS does not override or extend the model's posture, only its subject matter.

## What to Know About the Overlay

The agent-messaging-service repository is an oddkit overlay on klappy.dev. The relationship:

- **Upstream baseline (klappy.dev):** all program-level canon — vodka architecture, definition of done, mode discipline, dry-canon-says-it-once, the writing canon, the AI voice clichés constraint, the canon article template. These apply here unchanged.
- **AMS overlay (this repo, `canon/` tree):** AMS-specific decisions, constraints, and convention canon. URIs in the `ams://` namespace.
- **Long-form spec docs (this repo, root):** `SPEC.md`, `AMS.md`, `PROTOCOL.md`, `ARCHITECTURE.md`, `POC-INFRA.md`, `POC-PLAN.md`, `ESSAY.md`, `GLOSSARY.md`, `HORIZON.md`, `PATTERNS.md`, `README.md`. These are governed by `SPEC.md` §14 revision discipline. They are the source of truth for the long-form reasoning; the `canon/` tree extracts their load-bearing constraints and adds the missing convention canon.

When a question is "what does AMS commit to about X?", check the overlay first, then the long-form docs. When a question is "what does the model do about Y?", check the upstream bootstrap.

## AMS-Specific Discipline to Know About

A handful of AMS-overlay constraints govern any work on this repo:

- **`ams://canon/decisions/D0007-spec-as-locking-surface`** — `SPEC.md` is the contract; deeper docs are reference. When they disagree, SPEC wins.
- **`ams://canon/decisions/D0008-horizon-as-constraint-set`** — every spec change runs the forward-compatibility check against `HORIZON.md`.
- **`ams://canon/constraints/permanent-non-goals`** — the layers AMS will never own. Proposals that would move AMS into one of these are rejected.
- **`ams://canon/principles/vodka-architecture-applied`** — the four review questions for any proposed change.

If proposing a change to the protocol, the architecture, or the wire, run those four review questions before the proposal lands as a doc edit.

## Search Discipline When Working on This Repo

When invoking oddkit tools, pass `knowledge_base_url=https://github.com/klappy/agent-messaging-service` so the overlay is loaded alongside the upstream baseline. Without that parameter, the overlay's canon does not appear in search results, and the model is reasoning from upstream-only knowledge — which is incomplete for AMS-specific questions.

The default `result_grouping` when an overlay is set is `overlay_first`, which means AMS canon appears before upstream canon for the same query. That is the right ordering for AMS work; do not change it without reason.

## What This Document Does Not Do

- Does not duplicate the upstream operating contract. The contract evolves upstream; this pointer stays thin.
- Does not establish AMS-specific posture rules for the model. There are none. The model's posture is the same on every project.
- Does not list every canon article in the overlay. Use `oddkit_search` or `oddkit_catalog` for discovery.

## See Also

- `klappy://canon/bootstrap/model-operating-contract` — upstream operating contract (read first, every session)
- `ams://knowledge-base` — the overlay's root pointer
- `klappy://canon/principles/dry-canon-says-it-once` — why this document is short
