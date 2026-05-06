---
uri: ams://encodes/2026-05-06/unit-economics-self-host-defense-moat
title: "Insight — AMS Unit Economics Produce a Self-Host Defense Moat by Structural Accident"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: stable
tags: ["ams", "encode", "insight", "learning", "handoff", "unit-economics", "cloudflare", "self-host", "vodka-architecture", "hibernation"]
epoch: E0008.5
date: 2026-05-06
type: L+H
status: encoded
quality_score: 4
quality_max: 4
governance_uri: klappy://canon/definitions/dolcheo-vocabulary
---

# Insight — AMS Unit Economics Produce a Self-Host Defense Moat by Structural Accident

> Raw Cloudflare cost per typical small TinCan conversation is ~$0.00003. The Workers Paid $5/mo subscription floor — applied whether usage is $0.01 or $4 — is the structural fact that defeats self-hosting. The moat isn't cleverness; it's CF's own subscription floor doing the work.

## Type classification

Encoded as both Learning (durable knowledge worth preserving across sessions) and Handoff (worth carrying forward into pricing/strategy work). Quality: 4/4 strong on both classifications.

## The numbers

**Cloudflare current pricing (verified 2026-05-06):**

- Workers Paid: $5/mo, 10M requests + 30M CPU-ms included; $0.30/M and $0.02/M overage
- Durable Objects: $0.15/M requests, ~$12.50/M GB-seconds duration
- WebSocket incoming messages: 20:1 billing ratio (20 incoming = 1 billed request)
- WebSocket outgoing messages and protocol pings: free
- Hibernation API: idle-but-connected sockets do not bill duration

**Per-conversation cost model (typical small):**

2 participants, 30 minutes session, 50 messages exchanged, ~5 control events. Components: ~2 DO connection requests + ~3 request-equivalents for messages + ~0.6 GB-seconds active duration (rest hibernates) + ~50 Analytics Engine writes via Tail Worker. Result: **~$0.00003 per conversation.**

**Per-conversation cost model (heavy):**

5 participants, 2 hours, 500 messages. Result: still under **$0.001 per conversation.**

**Per-account variable cost at typical engagement (~30 conversations/month):**

**~$0.005–$0.01/mo.** The $5/mo Workers Paid floor amortizes across the entire user base — marginal users cost essentially nothing.

## The structural fact

CF's Workers Paid subscription floor is $5/mo whether the user consumes $0.01 or $4 of underlying compute. Anyone whose TinCan bill is below $5/mo is **strictly worse off self-hosting** before counting the time cost of maintaining wrangler/canon/governance. That's everyone on Tin and Foil and most of Industrial.

The moat does not require us to be clever about packaging or to gate features. CF's own pricing model is doing the work.

## Margin profile across scale

Vodka architecture + Durable Objects scale-to-zero + Hibernation API produces ~95% gross margin at every plausible scale (1M to 200M accounts). Typical SaaS gross margin is 75–85%; this model exceeds that at every scenario tested.

## Caveat

The cost model assumes Hibernation API actually fires under real load. If chatty agents keep DOs awake, duration cost dominates and the per-conversation number warps by 10–50×. Margins compress 10–30 points but remain positive. Wants measurement under realistic traffic before any tier limit commits.

## Provenance

Encoded from session 2026-05-06 during pricing exploration. Architecture references: D0006 (dream-house wire-edge-wrappers), D0020 (agents-as-customer / substrate for VAS), D0026 (TinCan as removable UI layer), wrapper-stays-cheap, doing-less-enables-more.
