---
uri: ams://canon/decisions/D0011-multi-host-cname-deployment
title: "D0011 — Multi-Host CNAME Deployment as the v1 Default"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: stable
tags: ["ams", "canon", "decision", "deployment", "cname", "multi-tenant", "vodka-architecture", "irreversible"]
epoch: E0008.4
date: 2026-05-02
derives_from: "POC-INFRA.md §1 §4 §8 (single Worker on Cloudflare); ams://canon/principles/per-query-dynamic-orchestration (Sovee inversion as design forcing function); operator confirmation in journal/2026-05-02-ams-poc-build-planning.tsv (planning convergence, 2026-05-02)"
complements: "ams://canon/decisions/D0006-dream-house-wire-edge-wrappers, ams://canon/decisions/D0002-magic-link-as-url, ams://canon/principles/per-query-dynamic-orchestration"
governs: "Where AMS deploys, how multiple branded hostnames map to a single Worker, and how magic links remain portable across hosts. Cannot be reversed without breaking magic-link portability and forcing per-tenant deployments."
status: active
---

# D0011 — Multi-Host CNAME Deployment as the v1 Default

> AMS deploys as a single Cloudflare Worker behind multiple custom domains via Sovee-style CNAMEs. v1 launches with two: `ams.klappy.dev` and `ams.truthkit.ai`. All CNAMEs route to the same Worker, the same KV, the same DOs. Magic links are host-portable. Account namespaces are global. The host carries no protocol-layer meaning — it is brand surface.

## The Decision

A single AMS Worker on Cloudflare is fronted by multiple custom domains that all point to the same Worker. v1 ships with two:

- **`ams.klappy.dev`** — the klappy-vertical surface.
- **`ams.truthkit.ai`** — the TruthKit-vertical surface.

Both hostnames route to one Worker instance, one KV namespace, one ConversationDO class, one SessionDO class. The Worker's `routes` declaration in `wrangler.toml` lists both:

```toml
routes = [
  { pattern = "ams.klappy.dev/*",   custom_domain = true },
  { pattern = "ams.truthkit.ai/*",  custom_domain = true }
]
```

Adding a third host is purely operational: add a custom-domain route, deploy.

## What This Means in Practice

- **Magic links carry whichever host minted them.** A link minted via `POST https://ams.klappy.dev/v1/klappy/conversations` is `https://ams.klappy.dev/klappy/conversations/...`. The host in the URL is whatever the mint request hit.
- **Magic links are portable across hosts.** A link with `ams.klappy.dev` resolves identically when opened against `ams.truthkit.ai` because the Worker is the same, the KV is the same, and the conversation DO is the same. Subscribers can attach via either host.
- **Account namespaces are global, not host-scoped.** A `klappy` account works under either host. The host carries no protocol-layer meaning.
- **The wire never reads the host.** The Worker reads `request.headers.get('host')` only when constructing magic links to return; everywhere else, the host is irrelevant.

## Why CNAME, Not Per-Tenant Workers

Per-tenant Workers would force per-tenant infrastructure: separate KV namespaces, separate DO migration paths, separate deploy surfaces. Magic links would not be portable because conversations would live in different Workers. A request hitting the wrong Worker would 404.

The CNAME pattern collapses all of this. One engine. N branded surfaces. The deployment topology stays a single substrate; tenancy is a DNS concern.

## The Sovee Lineage

This is the same inversion `ams://canon/principles/per-query-dynamic-orchestration` records at the wire layer, applied at the infrastructure layer. At Sovee, CNAMEs let one statistical-MT engine serve N branded customer surfaces without per-customer pipelines. At AMS, CNAMEs let one broker serve N organizational surfaces without per-org infrastructure. The forcing function — keep the substrate cheap so dynamic composition stays cheaper than declaration — is preserved because adding a hostname adds zero per-request cost.

## What Falls Out For Free

- **Brand surface for partners.** A partner that wants their own `ams.partner.com` adds a CNAME and a route entry. They are operating on the same broker as everyone else; their conversations interop with everyone else's; they get their own URL aesthetics.
- **Migration story.** When a vertical wants its own infrastructure later, the CNAME flips to a different Worker. Magic links minted before the cutover continue to resolve from the original Worker; new links mint against the new Worker. The transition is a DNS cutover, not a database migration.
- **No per-host code paths.** The host is irrelevant to wire, KV, and DO logic. All host-blind.

## What This Forecloses

- **Per-host conversation isolation.** A conversation minted on `ams.klappy.dev` is reachable from `ams.truthkit.ai`. If isolation is later required (regulatory, contractual), it would have to land as per-host KV namespace + per-host DO class — a structural change. v1 does not foreclose adding this later, but the v1 default is shared substrate.
- **Per-host pricing or quotas at the wire layer.** If a host needs distinct quota policy, it has to be enforced above the wire (in the SessionDO or a dedicated middleware), not at the routing layer.
- **Host-as-namespace.** Some systems use the host as an implicit namespace prefix (e.g., `tenant.example.com` implies `tenant` namespace). AMS does not. Namespaces remain explicit in the URL path.

## Reversibility

**One-way for v1.** Splitting into per-host Workers would break magic-link portability across the existing link space — links carry one host, and if that host's Worker no longer holds the conversation the link 404s. The split would have to be staged with a translation layer that the v1 design does not include.

The two-way alternative — keeping the single Worker but adding optional per-host policy hooks — remains available as a v2 extension without violating the v1 commitment.

## See Also

- `ams://canon/principles/per-query-dynamic-orchestration` — the Sovee-substrate principle this is the operational counterpart to
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the wire-layer separation this layers on top of
- `ams://canon/decisions/D0002-magic-link-as-url` — why magic links are URLs and what host-portability means for them
- `journal/2026-05-02-ams-poc-build-planning.tsv` — the planning convergence that recorded this decision (D and L artifacts)
- `POC-INFRA.md` §8 — the wrangler.toml routes declaration this drives
- `SPEC.md` §6 — the architecture diagram the dual hostname appears in
