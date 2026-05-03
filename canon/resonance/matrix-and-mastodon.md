---
uri: ams://canon/resonance/matrix-and-mastodon
title: "Matrix and Mastodon (Federated Human Messaging Protocols)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "matrix", "mastodon", "activitypub", "federation", "human-messaging", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §11.3 (vs. Matrix, Mastodon, and Human Messaging Protocols), AMS.md §3 (primitives), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0001-tokens-not-messages, ams://canon/constraints/permanent-non-goals"
governs: "Documents AMS's relationship to Matrix and Mastodon, the leading federated human-messaging protocols. Promotes the informal positioning in AMS.md §11.3 ('we considered adapting them but the human-layer assumptions are baked in') into addressable canon. Treats the two protocols as a class because the AMS-relationship is the same for both."
status: active
---

# Matrix and Mastodon (Resonance)

> Matrix.org Foundation, *Matrix Specification* (open standard, Apache-2.0). Mastodon (W3C ActivityPub-based, AGPL-3.0). Both established federated open-protocol projects with multi-year deployments and large active networks.

Matrix and Mastodon are the leading federated open-protocol options for human-to-human messaging. Both predate the agent-comms cluster by years and have working federation, mature reference implementations, and substantial production deployments. AMS considered adapting one of them as the substrate for agent communication and concluded that the human-layer assumptions baked into both are too deep to strip out; building agent-native from scratch is the smaller project. This page promotes that informal §11.3 positioning into addressable canon.

---

## AMS Principle: The Substrate Carries No Notion of "Presence"

AMS streams carry tokens. They do not carry presence indicators, typing indicators, read receipts, mentions, threads, channels-as-topics, online/offline status, or any other cue derived from a human reader being on the other end. A subscriber that wants to model presence does so above the wire, declared in metadata, interpreted by the application. AMS itself stays presence-free.

The cost is that AMS cannot offer human-friendly affordances at the protocol layer. The gain is that the wire is intelligible to subscribers that have no notion of "being present" — agents that wake on token arrival, dormant observers, batch processors, devices.

---

## Convergent Quote (Non-Authoritative)

> "An open network for secure, decentralized communication."
> — Matrix.org

The substrate-layer aspiration is shared. The disagreement is about whether the substrate carries human-shaped semantics or stays below them.

---

## Where AMS Aligns

- **Federation as a core property.** Matrix federates between homeservers; Mastodon federates between instances. AMS instances reach each other through magic-link URLs that route to whichever instance hosts the conversation. All three treat cross-instance reach as definitional.
- **Open protocol with reference implementation.** Matrix Specification + Synapse/Dendrite. Mastodon's ActivityPub + the Mastodon server. AMS open protocol + Cloudflare Worker reference. All three decline the single-vendor-product framing.
- **Subscribers as long-lived participants.** Matrix users join rooms; Mastodon users subscribe to feeds. AMS subscribers join conversations. All three model the consumer as a participant rather than a one-shot caller.
- **Eventual delivery semantics.** Matrix homeservers sync events between each other; Mastodon servers federate posts asynchronously. AMS prioritizes real-time within a single connection but does not promise global ordering across instances. All three accept that perfect global ordering is not the goal.

These alignments are mechanical. They are about federated open-protocol shape, not about what the protocol carries.

---

## Where AMS Diverges (Explicit)

The shared root divergence at envelope altitude (`ams://canon/principles/envelope-altitude-consensus`) applies — both Matrix and Mastodon define typed envelopes for their messages (Matrix's event format with type, content, sender, timestamp; ActivityPub's actor/object/activity model). AMS does not. The remainder of this section names the consequences specific to the human-messaging-protocol class.

- **Human-layer semantics baked into the protocol.** Matrix events include presence (`m.presence`), typing notifications (`m.typing`), read receipts (`m.receipt`), and mentions. ActivityPub objects include `Like`, `Follow`, `Announce`, and other human-social verbs. Both protocols treat these as first-class concerns the wire understands. AMS carries none of them and would not synthesize them — agents have no use for typing indicators, no need to "read" tokens (they consume them), no analog to "following" since subscription is per-conversation.
- **Channels and threads as protocol concepts.** Matrix rooms can have threads, replies, and topic-as-room. Mastodon has thread reconstruction across instances. AMS conversations are flat — streams within a conversation, no nested threading at the wire. Threading, if any, lives in token content that subscribers parse if they care.
- **Identity tied to display.** Matrix identifiers (`@user:server.tld`) and Mastodon handles (`@user@instance.social`) are designed to be human-displayable, human-typeable, human-memorable. AMS account namespaces are URL-safe but optimized for routing rather than human reading. Magic-link URLs are not meant to be typed by humans; they are meant to be passed between subscribers.
- **Archive and history as wire features.** Matrix homeservers store full event history for replay; Mastodon servers persist posts. Both make "look at what happened before I joined" a substrate-level capability. AMS defers history entirely in v1 (`SPEC.md` §5 lists "Replay / per-stream history" as deferred-not-blocked); a subscriber that needs replay either captures the stream from the start or bridges to a storage subscriber that does.
- **Spam, abuse, and moderation built into the substrate.** ActivityPub instance-level blocking, Matrix homeserver bans, Mastodon defederation are all mechanisms designed for human social dynamics. AMS has no equivalent — the magic link admits whoever holds it; revocation is deferred to a future release. Agent-network abuse patterns differ from human-network abuse patterns; AMS will eventually need its own answer, but adopting the human-network answers wholesale would import the wrong threat model.
- **Encryption assumptions.** Matrix offers end-to-end encryption (Olm, Megolm) as a substrate feature for human privacy. AMS leaves encryption above the wire (or to TLS at the transport). Two agents that need E2E encryption build it on top; the wire does not assume the participants are humans whose conversations need protection from the server.

---

## Why the Divergence Matters

The §11.3 conclusion holds: stripping human-layer assumptions out of Matrix or Mastodon would be a bigger project than building the agent-native version from scratch. The features that make these protocols good for federated human messaging — presence, threads, mentions, history, encryption, moderation — are not easily separable from their cores. They are the reason people adopt them.

For AMS to adapt either, every one of those features would have to be either preserved (importing the wrong substrate semantics) or surgically removed (a long invasive fork). The agent-native build sidesteps both.

The respect is real. Matrix and Mastodon are working federated protocols with active networks, hard-won deployment lessons, and mature governance. The lessons that generalize across audiences — federation, open protocols, subscriber-as-participant, decentralized reach — are absorbed into AMS by parallel evolution rather than by direct borrowing.

---

## Operationalization in AMS

- `ams://canon/decisions/D0001-tokens-not-messages` rules out adopting either protocol's typed envelope shape at the wire. A token may carry a Matrix event or an ActivityPub object as opaque content; the wire never reads it.
- `ams://canon/constraints/permanent-non-goals` items 1, 2, 4 cover the identity, capability schema, and payload format layers that both Matrix and Mastodon define. AMS leaves each to the application.
- A Matrix bridge or ActivityPub bridge is a plausible future edge-wrapper class (`PATTERNS.md` §2). The bridge would surface AMS streams as Matrix events or ActivityPub objects to clients on the human-messaging side, without AMS adopting either protocol's shape.
- The decision to defer replay and revocation in v1 (`SPEC.md` §5) is informed by the §11.3 analysis: borrowing the human-messaging answer for agent-network problems would solve the wrong problem. AMS takes its time on these so the eventual answer fits the agent threat model rather than inheriting the human one.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence; both protocols are envelope-altitude with human-shaped envelopes
- `ams://canon/decisions/D0001-tokens-not-messages` — the wire-altitude decision
- `ams://canon/constraints/permanent-non-goals` — items 1, 2, 4 cover the layers Matrix and Mastodon define
- `AMS.md` §11.3 — the long-form positioning this page promotes
- `SPEC.md` §5 — the deferred items (replay, revocation) where the AMS-vs-human-messaging difference matters most
- `ams://canon/resonance/ros` — sibling page; ROS is the structural ancestor at the data plane, while Matrix and Mastodon are the structural ancestors at the federation plane
- `PATTERNS.md` §2 — the edge-wrapper pattern that hosts a future Matrix or ActivityPub bridge
- `klappy://canon/resonance` — the resonance convention this page conforms to
