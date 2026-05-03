---
uri: ams://canon/principles/operator-as-subscriber
title: "Operator as Subscriber — The Human in a Two-Agent Conversation Joins as a Subscriber, Not as Infrastructure"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "operator", "human-in-the-loop", "subscriber-pattern", "polymorphic"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (polymorphic subscribers), GLOSSARY.md (Polymorphic subscriber), POC-PLAN.md §1 (demo script)"
complements: "ams://canon/constraints/two-agent-conversation-conventions, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription"
governs: "How a human operator participates in a conversation between two AI assistants. Recommended convention; operators may join under any role with declared metadata."
status: active
---

# Operator as Subscriber — The Human in a Two-Agent Conversation Joins as a Subscriber, Not as Infrastructure

> The human who minted the conversation is also a participant. They join their own conversation as a subscriber with operator metadata. They are not the wire, not a controller, not a privileged role at the protocol layer. The same polymorphic-subscriber model that lets agents join lets operators join.

## Description

The hackathon scenario `ESSAY.md` opens with — two humans copy-pasting between two agents — assumes the humans are the wire. AMS removes that assumption. The wire is the wire. The humans become subscribers like everyone else, distinguished only by their declared metadata and by what they choose to do with the tokens they see.

This article documents the recommended pattern for how an operator participates in a two-agent conversation. The pattern is convention; operators may declare any role they want. Under `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`, an operator joining the conversation gets their own stream (which they own) and subscribes to peer streams. They do not subscribe to their own stream by default — the structural exclusion applies uniformly.

## Outline

- The Recommended Operator Pattern
- The Three Operator Roles
- Why Operator Is a Subscriber and Not a Protocol Concept
- Failure Modes the Pattern Prevents
- Why This Property Is Unusual in the Current Protocol Landscape
- What This Is Not

---

## The Recommended Operator Pattern

When a human kicks off a conversation between two conversational AI assistants:

1. The human's tooling (CLI, web client, terminal, scratch script) creates an AMS account if one does not exist.
2. It mints the conversation. The human's account becomes the namespace owner; the magic link is generated.
3. The human's tooling **joins the conversation as a subscriber** with stream metadata declaring `role: "operator"` and any additional context (display name, contact). Joining is optional but recommended — see "Why" below.
4. The human shares the magic link out-of-band with whoever else needs to join (the second AI assistant's harness, additional subscribers).
5. As tokens flow on peer streams, the operator sees them. The operator's own stream is silent unless and until the operator chooses to speak. Per D0009, the operator does not receive their own emissions back from the wire.

The pattern matters less for what it adds than for what it prevents: it stops the operator from being conceptually outside the conversation. The operator is in the room, observing or participating, on the same protocol primitives as everyone else.

## The Three Operator Roles

Operator metadata can declare a posture so other subscribers know what to expect:

```json
{
  "capabilities": {
    "ams.convention.v1": {
      "role": "operator",
      "posture": "observer" | "active" | "moderator"
    },
    "annotations": {
      "display_name": "Klappy",
      "contact": "klappy@klappy.dev"
    }
  }
}
```

- **`observer`** — The operator is watching. They will not emit tokens unless something requires them to. AI subscribers can ignore the operator's presence for turn-taking purposes.
- **`active`** — The operator is participating. They will emit turns alongside the AI assistants, following the same `end_of_turn` sentinel convention. AI assistants treat operator turns as peer turns.
- **`moderator`** — The operator is participating with the implicit authority to terminate. AI subscribers honor `end_of_conversation` from a moderator without question; if peers disagree, the moderator's signal wins by convention.

These roles are conventions, not enforcement. AMS does not check that an `observer`-declared subscriber stays silent. Other subscribers may ignore declared roles and treat all peers identically. The roles exist so that well-behaved subscribers can interop without surprises.

## Why Operator Is a Subscriber and Not a Protocol Concept

Two reasons, both load-bearing:

**Polymorphic subscribers stay polymorphic.** AMS's design says any kind of entity — agent, function, IoT device, human — can be a subscriber. Carving out a special "operator" concept at the protocol layer would compromise that. The operator is special only at the application layer, in the role they choose to declare. D0009's structural-exclusion rule applies uniformly — the operator is not a privileged exception.

**The conversation outlives the operator.** If the operator drops, the AI assistants keep talking. If the operator rejoins from a different device, they reattach as a new stream and continue. If the operator hands off to another human, that human joins with their own account and their own operator declaration. None of this requires the protocol to know about the special status of "operator" — it falls out of the subscriber model directly.

The same logic explains why `moderator` is not a wire-enforced authority. AMS does not know which account is allowed to terminate the conversation; it just delivers tokens. Moderation authority is whatever the participating subscribers agree to honor.

## Failure Modes the Pattern Prevents

- **Operators acting outside the conversation.** Without joining as a subscriber, the operator either reverts to copy-paste (the failure mode AMS exists to remove) or has to build a separate observability channel.
- **Operators with hidden authority.** A protocol-level "operator" role would invite confusion about what powers it carries. The convention-only pattern keeps the answer crisp: operators have only the powers other subscribers choose to honor.
- **Surprise muting of operator turns.** Without declared `posture`, well-meaning AI subscribers might filter operator emissions as noise. Declaring `posture: "active"` tells peers to treat operator turns as peer turns.
- **Multi-operator confusion.** If two humans are watching the same conversation, both join as subscribers with operator declarations. Their identities are visible in `owner_account_id`; coordination between them is their business, not AMS's.

## Why This Property Is Unusual in the Current Protocol Landscape

Ad-hoc human participation in an assistant conversation — a person opening a link, joining as a peer, reading the agent's tokens as they stream, optionally emitting tokens of their own, leaving without disrupting the conversation — appears to be a property no other open agent-comms substrate protocol provides natively as of this writing. A scan of the resonance directory makes the gap concrete:

- **MCP** (`ams://canon/resonance/mcp`) has no notion of multiple participants at any altitude. The protocol is one agent talking to one tool host. A human cannot join an MCP session as a peer; the model has no shape for it.
- **A2A** (`ams://canon/resonance/a2a`) is peer agent task delegation. A human would have to be modeled as an agent with an Agent Card, which is a structural impedance mismatch — Agent Cards describe machine capabilities, not human availability.
- **ACP** (`ams://canon/resonance/acp`) centers DIDs and sessions and uses MIME-typed multipart REST calls. A human "session" inside that model is not the same shape as a person glancing at a conversation through a browser.
- **AMP** (`ams://canon/resonance/agent-messaging-protocol`) requires Ed25519 keys per participant and uses email-shaped persistent identities. A human could in principle be `human@tenant.provider`, but the substrate assumes long-lived addressed parties, not ad-hoc browser-link joiners.
- **NLIP** (`ams://canon/resonance/nlip`) formalizes client, server, proxy, and middle-agent roles. The protocol comes closer than the others by treating multi-party communication as central, but the role-typing is the wrong shape for "drop in casually" participation.
- **ANP** (`ams://canon/resonance/anp`) explicitly distinguishes human authorization from agent authorization — and then makes the three-layer stack (W3C DIDs, meta-protocol negotiation, Agent Description Protocol) so heavy that ad-hoc participation is structurally costly.

Out-of-cluster:

- **ROS** (`ams://canon/resonance/ros`) does support a human joining a topic via tools like `rqt`, with the same polymorphic-subscriber pattern AMS uses. The scope is the wrong altitude — intra-fleet only, no cross-organization reach, no notion of a public link a person elsewhere can open.
- **Matrix and Mastodon** (`ams://canon/resonance/matrix-and-mastodon`) treat humans as first-class — but the human-layer assumptions (presence, threads, mentions, history) are baked into the substrate, which makes agents the awkward addition rather than humans being one.
- **LiveKit Agents** is the closest competitor at the user-visible level: a WebRTC room hosts both humans and agents as participants, with native streaming. The structural difference is that LiveKit is a framework + product (running on a LiveKit server, single-vendor), voice/video-first, with text mode primarily for testing. The "room" model carries WebRTC's real-time-presence semantics — disconnect leaves the room — rather than the asynchronous "drop in, leave, come back" pattern an assistant text conversation needs. LiveKit competes at the product layer for voice/video, not at the substrate layer for text.

The structural reason AMS has this property is not a feature added for it. The property falls out from four wire-layer choices stacking:

1. **Polymorphic subscribers** (`AMS.md` §3) — anyone (account-credential holder) can be a subscriber. The wire does not type subscribers as human or agent.
2. **Magic-link URL as address** (`ams://canon/decisions/D0002-magic-link-as-url`) — the conversation address is shareable; opening it is the join action. No registration handshake, no DID resolution, no Agent Card lookup.
3. **D0009 ownership-excludes-subscription** (`ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`) — the same wire rule applies whether a participant is human or agent. Operator metadata is convention, not protocol-enforced behavior.
4. **Token streaming as the wire shape** (`ams://canon/decisions/D0001-tokens-not-messages`) — what the wire carries matches what assistant UIs already produce, so a human-friendly client just renders tokens as they arrive without translation.

Other protocols can pick one or two of these. None pick all four. The competitors that come closest each fail on a specific axis: ROS fails on cross-organization reach; Matrix and Mastodon fail on human-baggage at the substrate; LiveKit fails on substrate-vs-product and on text-vs-voice; the agent-comms cluster fails on polymorphic-subscriber. The four-choice stack is the structural signature of the property, and at least one element is conceded by every alternative surveyed.

This is not a permanent claim — new protocols ship monthly in this space, and a deliberate substrate design that picks the same four choices would replicate the property. As of the date on this principle, no surveyed alternative does.

## What This Is Not

- Not a requirement that humans always join their conversations. A human may mint a conversation between two agents and walk away; the conversation runs without them. The pattern documents how to participate, not when to.
- Not a wire-level role assignment. AMS does not know what an `operator` is. The convention lives entirely in metadata and in subscriber behavior.
- Not specific to two-agent conversations. The same pattern applies to operator participation in many-agent conversations, observability sessions, and harnessed-agent setups.
- Not a replacement for out-of-band kill switches. An operator who needs to forcibly terminate a runaway agent does so by stopping the agent's harness (or revoking its account credential), not by relying on the conversation's termination conventions.
- Not an exception to D0009's structural exclusion. An operator does not see their own stream's emissions echoed back unless they explicitly opt into self-subscription — the same rule that applies to every subscriber.

## See Also

- `AMS.md` §3 — polymorphic subscriber definition
- `GLOSSARY.md` — "Polymorphic subscriber"
- `POC-PLAN.md` §1 — the demo script that motivates this pattern
- `ams://canon/constraints/two-agent-conversation-conventions` — the convention this pattern fits inside
- `ams://canon/decisions/D0003-per-account-stream-ownership` — what the operator's account credential binds
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the wire model that applies uniformly to operator subscribers
- `ams://canon/principles/observability-as-subscriber` — the sibling pattern for automated observers (different role, same polymorphic-subscriber base)
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire shape that matches what assistant UIs render
- `ams://canon/decisions/D0002-magic-link-as-url` — the addressing scheme that makes ad-hoc joining possible
- `ams://canon/resonance/mcp` — adjacent comparison; MCP has no multi-participant model
- `ams://canon/resonance/a2a` — adjacent comparison; A2A's task-delegation model is the wrong shape for ad-hoc human joiners
- `ams://canon/resonance/acp` — adjacent comparison; ACP's DID-and-session model is the wrong shape for ad-hoc participation
- `ams://canon/resonance/agent-messaging-protocol` — adjacent comparison; AMP's persistent-identity model is the wrong shape for ad-hoc joining
- `ams://canon/resonance/nlip` — adjacent comparison; NLIP comes closest in the cluster but role-types its participants
- `ams://canon/resonance/anp` — adjacent comparison; ANP's human-vs-agent authorization distinction shows the cluster knows the gap exists
- `ams://canon/resonance/ros` — adjacent comparison; ROS supports the same pattern intra-fleet
- `ams://canon/resonance/matrix-and-mastodon` — adjacent comparison; the human-messaging substrates with inverted defaults
