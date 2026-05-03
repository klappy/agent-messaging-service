---
uri: ams://canon/resonance/ros
title: "Robot Operating System (ROS)"
audience: canon
exposure: nav
tier: 3
voice: neutral
stability: stable
tags: ["ams", "canon", "resonance", "ros", "ros2", "pub-sub", "structural-ancestor", "topics", "dds", "divergence"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (primitives), AMS.md §11 (positioning), ams://canon/principles/envelope-altitude-consensus, ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription, ams://canon/constraints/permanent-non-goals"
governs: "Documents AMS's relationship to the Robot Operating System (ROS, ROS 2). ROS is the structural pub-sub ancestor whose primitives — topics, publishers, subscribers — most closely match AMS's streams, writers, subscribers. The alignment is unusually deep; the divergence sharpens precisely because of it."
status: active
---

# Robot Operating System (ROS) (Resonance)

> Open Robotics, *ROS 1* (2007 → 2025 EOL) and *ROS 2* (2017 → ongoing). Apache-2.0. ROS 2 builds on the Data Distribution Service (DDS) standard from the Object Management Group.

ROS is the structural ancestor in this directory. The pub-sub primitives that AMS lands at — writers, subscribers, streams broadcast inside a coordination context — are the same shape ROS landed at twenty years ago for robot software. Topics, publishers, subscribers, and the structural exclusion of self-subscription are all ROS conventions before they are AMS conventions. The resonance is not coincidence; it is the same load-bearing answer to the same shape of problem at different scales. The divergence is what changes when "the same machine running coordinated processes" becomes "different organizations running coordinated agents."

---

## AMS Principle: Pub-Sub Across Organizations Without a Master

AMS broadcasts streams between subscribers admitted to a conversation. There is no master node, no global registry, no typed message catalog the wire validates against. Discovery is solved by the magic-link URL: the URL routes to the conversation; whoever has the URL can join. Heterogeneity across organizations is the design case, not an exception to handle.

The cost is that AMS gives up the type safety, the fleet-wide topic registry, and the deterministic latency profile that ROS achieves inside a single fleet. The gain is that AMS works across organizational boundaries where ROS structurally cannot.

---

## Convergent Quote (Non-Authoritative)

> "Publishers and subscribers communicate via topics."
> — ROS 2 documentation

The same sentence describes AMS, with "writers" substituted for "publishers" and "streams" substituted for "topics." The mechanical shape of the pub-sub answer is shared. The questions of who participates and where they are are where the two systems diverge.

---

## Where AMS Aligns

- **Pub-sub as the primitive.** ROS topics are addressable channels; multiple publishers can write, multiple subscribers can read. AMS streams are owned by a single account-writer, with multiple subscribers. The shape (one-or-more writers, many readers, broadcast semantics) is shared at the wire level.
- **Subscribers as polymorphic.** ROS subscribers can be any node — a sensor process, a planner, a logger, a visualization tool. AMS subscribers can be any account — an agent, an operator, an observability subscriber, a device. Both treat the consumer of broadcast data as polymorphic by design.
- **Streaming as the cognition shape.** ROS sensor topics emit at high frequency; subscribers consume at their own pace. AMS streams emit tokens as the writer produces them; subscribers process incrementally. Both refuse the request-response model as the substrate.
- **Decoupled lifecycles.** ROS publishers and subscribers come and go independently; the topic outlives any single participant. AMS streams and subscribers come and go independently; the conversation outlives any single subscriber. Both treat process lifetime as orthogonal to the data plane.
- **Late-binding observability.** ROS allows `rosbag` recording and replay of any topic by joining as a subscriber. AMS allows observability-as-subscriber (`ams://canon/decisions/D0010-observability-via-subscriber-not-wire`) by the same mechanism. Both make audit a participant rather than a wire feature.

These alignments are mechanical and deep. ROS is the closest precedent in this directory by structural similarity.

---

## Where AMS Diverges (Explicit)

The shared root divergence — envelope altitude vs token altitude — applies to ROS the way it applies to the agent-comms cluster (`ams://canon/principles/envelope-altitude-consensus`). ROS messages are typed (.msg files compiled into language bindings); the wire knows the schema. AMS tokens are opaque. The remainder of this section names the consequences specific to ROS.

- **Master node and registry vs registry-less.** ROS 1 requires a master node (`roscore`) for discovery — every node registers with the master, which mediates topic-to-publisher resolution. ROS 2 dropped the central master and uses DDS for peer-to-peer discovery within a fleet, but discovery still presumes a single multicast domain or pre-configured discovery server. AMS has no registry at any altitude. Discovery is solved by the magic-link URL itself — the URL is the address; whoever holds it can join.
- **Intra-fleet vs cross-organization.** ROS is built for processes on the same machine, the same robot, or the same coordinated fleet under one operator. The DDS layer assumes a low-latency, high-trust, single-administrative-domain network. AMS is built for subscribers in different organizations, on different stacks, behind different model providers, with no shared administrative domain. The use case AMS targets does not fit inside any ROS deployment model.
- **Typed messages vs opaque tokens.** ROS messages have a fixed schema declared in `.msg` files and compiled into per-language bindings. The wire validates against the schema. AMS tokens are opaque bytes — the wire never parses them. ROS's typing is load-bearing for its target (catching control-loop bugs at compile time across a robot's processes); AMS's opacity is load-bearing for its target (carrying any application's payloads without coordination above the wire).
- **QoS at the wire vs QoS at the subscriber.** ROS 2 inherits DDS's rich Quality-of-Service contract: reliability, durability, deadline, liveliness, history depth, all negotiated between publishers and subscribers at connection time. AMS commits to ordered delivery within a single connection and otherwise defers QoS to the subscriber and the application. AMS subscribers that need stronger delivery semantics build them above the wire; AMS does not negotiate QoS at the protocol layer.
- **Self-subscription default.** ROS publishers can subscribe to their own topics by default — the wire does not exclude self-delivery. AMS structurally excludes self-delivery (`ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`), with self-subscription as an explicit opt-in. ROS leaves the no-feedback-loop discipline to application code; AMS makes it a wire-level guarantee.
- **Deployment model.** ROS deploys as processes on machines under one operator's control. AMS deploys as instances reachable at distinct hostnames with magic-link URLs that route to whichever instance hosts the conversation. The two systems answer different questions about who runs what.

---

## Why the Divergence Matters

ROS is right about pub-sub as the primitive. AMS adopts the same primitive because the same primitive is right for the same kind of problem — coordination between independent processes that produce and consume data streams. The alignment is the proof that the primitive scales beyond robotics into agent communication.

The divergence is everything that changes when the boundary moves from "one operator's robot" to "many operators' agents." Discovery, typing, QoS, and deployment all turn from solved problems into problems that have to be solved differently — or, in AMS's case, solved at a different layer than the wire.

A useful framing: ROS is what the dial-tone-for-pub-sub looks like inside a single fleet. AMS is what dial-tone-for-pub-sub looks like across the open internet. The two systems are not in tension; they answer the same question in different scopes, and the divergences are exactly what the scope difference forces.

---

## Operationalization in AMS

- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` makes the self-echo exclusion structural where ROS leaves it as discipline. The structural choice was informed by ROS's experience that the discipline gets violated under pressure.
- `ams://canon/constraints/permanent-non-goals` items 1, 2, 5, 7 collectively refuse the layers ROS owns inside a fleet — identity scheme, capability schema (the type system), mandated transport (DDS), registry shape (the master node or DDS discovery domain). AMS leaves each to the application or to the magic-link addressing scheme.
- `ams://canon/principles/operator-as-subscriber` and `ams://canon/principles/observability-as-subscriber` are direct applications of the polymorphic-subscriber pattern that ROS pioneered for robot tools (`rqt`, `rosbag`, `rviz`).
- `PATTERNS.md` §2 establishes that adapters from non-WebSocket runtimes are edge wrappers, not wire changes. A ROS bridge — translating between a ROS topic and an AMS stream — would be one such wrapper, exposing a ROS subscriber as an AMS writer (or vice versa) without altering either protocol's wire.

---

## Related Canon

- `ams://canon/principles/envelope-altitude-consensus` — the shared root divergence; ROS messages are typed envelopes by the same general pattern as the agent-comms cluster
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the structural exclusion ROS leaves as discipline
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the same pattern ROS uses for `rosbag` and `rqt`
- `ams://canon/principles/operator-as-subscriber` — the polymorphic-subscriber pattern ROS pioneered for robot tools
- `ams://canon/principles/observability-as-subscriber` — the same pattern in AMS
- `ams://canon/constraints/permanent-non-goals` — items 1, 2, 5, 7 cover the layers ROS owns and AMS leaves above
- `PATTERNS.md` §2 — the edge-wrapper pattern that hosts a future ROS bridge
- `ams://canon/resonance/recursive-mas` — sibling page; both ROS and RecursiveMAS are out-of-cluster comparisons (one structurally adjacent at altitude 3 within a fleet, one at altitude 5 inside a trained loop)
- `klappy://canon/resonance` — the resonance convention this page conforms to
