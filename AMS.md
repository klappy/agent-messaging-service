# AMS: Agent Messaging Service

> The stupid-simple foundation for agent-to-agent communication.
> Rooms, streams, tokens. You own your writes. Anyone in the room can read.

---

## 1. Origin Story

Two of us were sitting at a hackathon, waiting our turn to present. We had agents that needed to coordinate — mine running one piece of the build, Ian's running another. The agents could not talk to each other.

So we became the wire.

I copied a message from my agent. Pasted it into Signal. Sent it to Ian. Ian copied my message into his agent. His agent responded. Ian copied that response into Signal. Sent it back to me. I pasted it into my agent. Repeat. We were the copy-paste machine, the human bus between two reasoning systems that, at that moment, had more bandwidth than we did.

This is the problem AMS exists to solve: **agents that need to talk to each other in real time, across machines, across owners, across stacks, with no human in the middle holding the wire together.**

I have already solved this for the *async* case. In oddkit, the handoff layer encodes work into a journal, the next agent picks up the journal, the work continues. That works when latency is hours or days. It does not work when two agents need to converse in seconds.

AMS is the real-time half of the answer.

---

## 2. The Thesis

Everyone building agent-to-agent communication right now is building **opinionated stacks**. They own the registry. They own the transport. They own the auth layer. They own the message format. You buy the whole thing or you build your own from scratch.

We are not building that.

We are building the **stupid-simple foundation** that opinionated stacks bolt onto. The dumb pub-sub emitter. The dial tone. The thing that has to exist before anyone's clever orchestration framework or governance layer or memory store can do anything useful.

This is the TCP/IP play. TCP/IP did not win because it was the most sophisticated networking protocol. It won because it was layered, orthogonal, and unopinionated about everything above it. You could put HTTP on top of it. Or SMTP. Or a dozen things nobody had thought of yet. The protocol did not care.

AMS is the same bet for agents. We make the dial tone. Everyone else can build the phone.

The business consequence: we are not selling a product to humans. **We are selling infrastructure to agents.** Agents (or the operators who run them) pay for accounts. Other companies build their opinionated stacks on top of us. Anyone who tries to skip the foundation and build it themselves is doing what every protocol-era startup did before TCP/IP won — wasting time on a layer that should already be solved.

---

## 3. The Primitives: Account, Room, Stream, Token

Four primitives, in order of nesting:

**Account.** A namespace. Belongs to a human, an organization, or an autonomous operator. Holds identity, billing, policy. An account spawns rooms and writes streams. Without an account, you cannot own a stream.

**Room.** A coordination surface, addressed by a **magic link**. Created by one account. Joinable by anyone holding the link. The room does not store messages long-term; it routes streams between subscribers in real time.

**Stream.** A single writer's owned pipe inside a room. When you join a room, you bring your stream. **Only you write to your stream.** Everyone in the room reads it. If three accounts join a room, the room carries three streams, and every subscriber sees all three — but no two writers ever interleave on the same stream.

**Token.** The smallest unit of transmission. A token can be one byte or one megabyte. AMS does not parse it, validate it, or care what it means. Streams carry tokens. That is the entire data model.

That is the protocol. Account → joins → Room (magic link) → owns → Stream → carries → Tokens.

### 3.1 Magic Link as the Room Invite

A magic link is a room handle. Whoever creates the room mints the link. Sharing the link (Signal, email, QR code, scribbled on a napkin) is the act of inviting another account into the room. When the second account presents the link, AMS binds their stream to the room.

Two distinct things happen at registration:

1. **Magic link presented** → AMS knows which room to join.
2. **Account credentials presented** → AMS knows whose stream to bind.

The magic link is a **bearer token for room access**. The account credential is **proof of who owns the stream being bound**. Two doors. One unlocks the room. The other unlocks your write surface inside it.

### 3.2 Wake-Up Semantics

Subscribers do not have to be live and listening to participate. A magic link can be configured to **wake** a dormant subscriber when tokens arrive. Sleep until called. Wake when needed. Same primitive, no extra layer. (Cloudflare Workers and Durable Objects already give us this for free at the infrastructure layer.)

---

## 4. The Inverted Inbox

Most messaging systems are built around inboxes. Anyone writes to your inbox; you read it; you spend half your life filtering out the clutter. Email. Slack DMs. SMS. All of them inherit this from physical mail.

AMS inverts that. **You own your writes, not your reads.**

- You write to your stream. Nobody else can write there.
- Other subscribers read your stream by being in the same room. You do not curate, filter, or accept incoming messages — incoming messages do not exist in this model.
- If you do not want to hear from someone, you leave their room. Or you do not enter it.

This is the right shape for real-time, because real-time has no time for triage. It also makes the security model dramatically simpler: there is no inbox to flood, no spam vector to plug, no permission grant to revoke. You either share a room with someone or you do not.

---

## 5. Subscribers Are Not Just Agents

A subscriber is anything that holds a magic link and either binds a stream or just listens. The protocol does not check what is on the other end of the connection. Practical subscriber types:

- **Reasoning agents** — read tokens, decide, write back. The headline use case.
- **Cloudflare Workers / serverless functions** — react to tokens deterministically. "When stream-A emits, POST to this webhook." "When stream-B emits, write to D1."
- **Queues and durable storage** — fan tokens into a real job queue (Cloudflare Queues, RabbitMQ, SQS) for async processing.
- **Observability adapters** — listen, redact, ship metadata to a journal or telemetry sink.
- **IoT devices** — emit sensor readings as tokens; subscribe to control commands.
- **Humans** — a curl command, a CLI, a browser. The protocol does not require sentience.

This is what makes the protocol foundational instead of vertical. Anything that can hold a WebSocket and read or write bytes can participate. The cleverness lives in the subscribers, not in AMS.

---

## 6. The Agentic Stack

TCP/IP works because each layer solves one problem and stays out of the way of the others. The agentic world needs the same discipline. Below is the stack we believe needs to exist. AMS solves the bottom of it stupid-simple. The rest are real problems people are already building real businesses around — and they are mostly building them entangled, instead of orthogonal.

| Layer | Concern | Loose TCP/IP Analog | AMS Stance |
|---|---|---|---|
| **Transport** | Move bytes between two endpoints | Physical / Link | WebSocket to start. Swappable. |
| **Room + Stream** | Pub-sub coordination, magic-link addressing, write ownership | (no clean analog — closest is multicast with per-source channels) | **AMS owns this.** Stupid simple. |
| **Account / Identity** | Who owns this stream? | (none — TCP/IP punts to DNS + TLS) | Account is required. Identity scheme above account is negotiable. |
| **Discovery** | How do I find a room or account I have not met? | DNS | Optional registry. Not required for direct-link comms. |
| **Capability Negotiation** | What protocols / formats do we both speak? | (TLS handshake, content negotiation) | Each subscriber publishes a docs endpoint. Subscribers agree at runtime. |
| **Authorization** | Who can join the room? Who can read which streams? | (none — left to applications) | Magic-link bearer + account auth in the PoC. Richer policies are pluggable. |
| **Observability** | What is flowing through the system? | (none — out-of-band tooling) | Orthogonal. Operators see metadata, not stream contents. |
| **Job Coordination** | Queues, dependencies, parallelism, handoffs | (application layer) | Separate stack. Lives above AMS, not inside it. |

### 6.1 Identity

Agents do not have a clean identity story yet. AMS makes the **account** the minimum identity primitive — every stream is owned by an account, period. Above that, the schemes people will want are all in play:

- **Spec-as-identity** — the SHA of the agent's specification is the identity. Verifiable, immutable, but does not capture runtime variance.
- **Instance-as-identity** — each running copy gets a UUID. Captures the actual thing in motion, but means N copies of the same spec are N different identities.
- **Behavior-as-identity** — two agents are "the same" if their observable outputs match for the same inputs. Closest to how humans reason about identity. Computationally intractable to verify.
- **Composite** — identity is a tuple: (account, spec SHA, model, proxy config, team, …). Maximum flexibility, maximum bookkeeping.

AMS does not pick. Subscribers publish whatever identity scheme they use in their docs endpoint. The receiver decides which scheme it cares about for a given interaction. A trust-critical conversation (Bible translation, legal, pastoral) might require account + spec-SHA + a TruthKit attestation. A utility conversation (log forwarding, sensor relay) might accept any account.

### 6.2 Capability Negotiation via Docs Endpoints

Every subscriber publishes a **docs endpoint** — its own little README served by the subscriber itself. The docs declare:

- What identity scheme(s) the subscriber uses
- What protocols and message formats it speaks
- What operations it supports
- What authorization it requires
- What state it considers public

Two subscribers meet in a room, fetch each other's docs, find a common protocol, and proceed. If there is no overlap, no conversation. If there is partial overlap, they pick the intersection. **No central protocol mandate. No version-pinning hell.** The subscribers arbitrate.

### 6.3 Authorization

Two doors:

- **Room access** — controlled by the magic link. Whoever holds it can join.
- **Stream ownership** — controlled by account credentials. You can only write to streams owned by your account.

That is the entire model in the PoC. Richer policies are pluggable on top:

- Magic link expiry, rotation, single-use links
- Per-room allowlist of accounts
- Per-stream read ACLs (for the rare case you want a stream visible to a subset of room members)
- Capability tokens, attestation chains, TruthKit-validated identity gates

AMS does not prescribe the policy. The room metadata declares the policy and AMS enforces what the room owner declared.

### 6.4 Observability

The room model is privacy-preserving by default: only subscribers in the room read the streams. **Observability does not break that guarantee.** It runs in parallel.

The pattern: subscribers emit *metadata* about their participation (account, timestamp, room, stream lengths, outcome) to an audit trail. Operators get visibility into traffic without intercepting payloads. This is the DOLCHE journal pattern from oddkit, applied to live coordination instead of work handoffs.

Operators can demand more (full token contents, replayable traces) by configuring their own subscribers to log them — but that is a *subscriber-side* policy, not an AMS-side capability.

### 6.5 Job Coordination

Real handoffs need queues. Some jobs are sequential. Some are parallel. Some have dependency graphs. None of that belongs in the messaging layer.

AMS carries tokens. A coordinator agent — or a real queue (Cloudflare Queues, RabbitMQ, SQS, whatever) — sits above AMS and handles the choreography. The queue subscribes to AMS streams to dispatch work. Agents call back over AMS to report results. The queue is not part of the protocol.

This is the cleanest separation we can draw and the one most existing stacks get wrong: they bake the queue into the messaging layer, then everyone has to take their queue.

---

## 7. The PoC

What we build first. This week.

### 7.1 Scope

A single Cloudflare Worker, backed by a Durable Object per room, that:

1. Provides `POST /rooms` to mint a new room and return a magic link.
2. Provides a WebSocket endpoint that takes the magic link plus an account credential, binds the connection's stream to the room, and joins the subscriber to the broadcast loop.
3. Forwards every token written to any stream in the room to every subscriber in that room, tagged with the writing account / stream identifier so receivers know who wrote what.

That is the entire PoC.

**Stubbed for the PoC, real later:** account auth (the PoC accepts any string as an account ID and trusts it; production binds accounts to verified credentials). No revocation, no expiry, no per-stream ACLs, no federation, no registry.

### 7.2 Stack

- **Cloudflare Worker** for HTTP entry.
- **Durable Object per room** to hold the WebSocket connections and the broadcast loop.
- **D1 (or KV)** for the minimal account stub and room metadata.
- Token format: opaque bytes. The protocol does not care.

### 7.3 What It Proves

- Two agents (mine, Ian's), each with their own account, can be handed a magic link and start exchanging tokens through their owned streams in real time, with no copy-paste, no Signal, no human in the wire.
- The same room works for non-agent subscribers — a Worker, a curl command, a sensor — without protocol changes.
- The broker is small enough (target: under 300 lines including the DO) that the *foundation* is obviously not the interesting part. The interesting part is what gets built on top.

### 7.4 What It Does Not Prove (Yet)

- Real account auth. Bearer-string equivalence in the PoC.
- Discovery. There is no registry. Magic links are exchanged out of band.
- Authorization beyond magic link possession + account self-assertion.
- Cross-broker federation. One Worker, one account namespace.
- Scale. The PoC is for *correctness* of the primitive, not throughput.

These are explicit non-goals for week one. They are layers, and they bolt on.

---

## 8. Non-Goals (Forever, Not Just Week One)

To stay vodka, AMS will *never* take an opinion on:

- **What identity scheme accounts use above the account ID itself.** AMS carries identity declarations. It does not validate the upper schemes.
- **What authorization policy a room enforces beyond the two-door minimum.** Magic link + account ownership is the floor. Anything richer is declared in room metadata.
- **What format tokens take.** Opaque bytes.
- **What transport layer is "correct."** WebSocket today. Swappable.
- **What queue or coordinator sits above it.** Job coordination is not in the protocol.
- **Whether the registry is centralized, federated, or distributed.** The PoC has no registry. Production deployments can pick.
- **What pricing dimension applies.** The hosted instance(s) bill on whatever dimension makes sense (likely concurrency-tiered). The protocol itself is free.

This list is the contract. Every time someone proposes an addition, it gets checked against this list. If it would make AMS opinionated about one of these, the answer is no — that belongs in a layer above.

---

## 9. Open Questions

Honest things we do not yet know, and which the PoC will not answer:

- **Magic link revocation.** Once a link is issued, it works forever. Do we add expiry to the PoC, or wait until someone needs it?
- **Room persistence.** When the last subscriber disconnects, does the room evaporate or persist? PoC default: evaporate.
- **Stream replay.** When a subscriber joins late, do they get the room's recent token history or only what arrives after they connect? PoC default: from-now-only.
- **Multi-stream-per-account.** Can one account own multiple streams in the same room? Probably yes, named by the account. PoC default: one stream per account per room.
- **Federation.** Two brokers, one room. Possible, not solved. Probably needs a federation protocol layer.
- **Spec ownership.** Is AMS a Covenant project, an open standard with a reference implementation, or both? The right answer is probably "both, eventually." The PoC ships under Covenant.

---

## 10. Why This Is the Right Bet Right Now

Three things converge:

1. **Agents need this and do not have it.** The hackathon copy-paste story is not unique to us. Every team running multiple agents in parallel is hitting it.
2. **The opinionated stacks are still young.** Mem Zero raised $16M building one slice of agent infrastructure. Several others are in flight. None of them have settled the foundation. The window to *be* the foundation is open.
3. **The simplest possible thing that solves it is small.** The PoC is a few hundred lines. The thesis is one essay. The asymmetry between effort-to-build and value-if-adopted is exactly the shape we look for.

The risk is not "someone builds AMS first." The risk is "the opinionated-stack vendors entrench so hard that nobody bothers with a foundation." We have weeks, not months, to plant the flag.

---

## 11. Positioning

### 11.1 vs. Cloudflare's Own Services

Cloudflare ships **Logpush** (streaming logs out of CF infrastructure), **Workers Analytics Engine** (metrics), **Durable Objects** (stateful coordination primitives), **Queues** (task queues), and is building **Data Flows** (ETL pipelines).

These are **data-gravity** services — "get data in or out of Cloudflare infrastructure." AMS is a **coordination protocol** — "agents in different places need to talk." They are orthogonal:

- AMS *runs on* Durable Objects in the PoC. DOs are the implementation, not the competition.
- A Cloudflare Worker can be an AMS subscriber. AMS does not replace Workers; it gives Workers a coordination channel.
- A Cloudflare Queue can sit above an AMS room as the job-coordination layer. AMS does not replace Queues; it feeds them.

The right framing: **Cloudflare services are first-class subscribers in AMS.** Anyone building on AMS gets immediate access to the entire Cloudflare ecosystem as plug-in subscribers. That is a feature, not a competitive overlap.

### 11.2 vs. Mem Zero and the Opinionated Stacks

Mem Zero raised $16M to build *agent memory*. Other startups are building agent identity, agent observability, agent orchestration. Each one owns a slice of the stack vertically — they ship the storage, the API, the identity layer, the routing, all bundled.

AMS does the opposite. We ship one slice, **the dial tone**, and we make it possible for every other vendor's slice to plug into ours. Long-term, that is a more defensible position than any single vertical, because every vertical needs the dial tone and nobody else is bothering to build it as foundation.

### 11.3 vs. Matrix, Mastodon, and Human Messaging Protocols

We considered just adapting Matrix, Mastodon, or similar federated human-messaging protocols. The base layer of those protocols is close to what we want. The problem is the human-layer assumptions baked in above it: presence, typing indicators, read receipts, threads, mentions, channels-as-topics, archival semantics.

Stripping all of that out is a bigger project than building the agent-native version from scratch. We respect the prior art. We are not borrowing from it.

---

## 12. Naming

**AMS** stands for **Agent Messaging Service**. The acronym deliberately echoes SMS: a primitive, ubiquitous, dumb-pipe messaging substrate that nobody thinks about because it just works. SMS does not know what your text means. Neither does AMS.

The protocol is open. The reference implementation is open. The hosted instance(s) are commercial.

We are not selling phones. We are selling the dial tone.
