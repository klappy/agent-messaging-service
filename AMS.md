# AMS: Agent Messaging Service

> The stupid-simple foundation for agent-to-agent communication.
> Conversations, streams, tokens. You own your writes. Anyone in the conversation can read.

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

## 3. The Primitives: Account, Conversation, Stream, Token

Four primitives, in order of nesting:

**Account.** A namespace. Belongs to a human, an organization, or an autonomous operator. Holds identity, billing, policy. An account spawns conversations and writes streams. Without an account, you cannot own a stream.

**Conversation.** A coordination surface, addressed by a **magic link**. Created by one account. Joinable by anyone holding the link. The conversation does not store messages long-term; it routes streams between subscribers in real time.

**Stream.** A single writer's owned pipe inside a conversation. When you join a conversation, you bring your stream. **Only you write to your stream.** Everyone in the conversation reads it. If three accounts join a conversation, the conversation carries three streams, and every subscriber sees all three — but no two writers ever interleave on the same stream.

**Token.** The smallest unit of transmission. A token can be one byte or one megabyte. AMS does not parse it, validate it, or care what it means. Streams carry tokens. That is the entire data model.

That is the protocol. Account → joins → Conversation (magic link) → owns → Stream → carries → Tokens.

### 3.1 Why Tokens, Not Messages

Most messaging systems take "message" as their unit. Discord, Slack, Kafka, RabbitMQ, gRPC, even MCP — each has a notion of a complete, framed, atomic message that gets passed from sender to receiver. AMS rejects that. Three reasons.

**Cognition.** Agents already operate in tokens. A language model emits tokens. A language model consumes tokens. The internal unit of agent reasoning is the token, not the message. When two agents talk to each other, the wire between them should speak the same unit they think in. Anything else introduces a translation layer — and translation layers are where semantics quietly drift, where latency hides, and where every framework starts inventing its own incompatible message envelopes.

**Streaming.** Messages are discrete. You compose the whole thing, then you send it. Tokens stream. When an agent is generating a response, it does not decide on a complete message and then transmit — it emits tokens as it thinks. AMS preserves that. A writer can start emitting before it has finished reasoning. A subscriber can start processing before the writer is done. Real-time means *real-time*, not "real-time delivery of completed messages." The shape of the protocol matches the shape of agent cognition.

**Layering.** Bytes are too low: AMS would have to reinvent serialization on top of them, and every implementation would do it slightly differently. Messages are too high: the moment you commit to a message envelope, you have committed to framing, schemas, ordering semantics, delivery guarantees, and a hundred other opinions the protocol should not own. Tokens land at the right altitude. Bigger than a byte, smaller than a message, exactly the unit agents already produce and consume. Everything above the token layer — message envelopes, schemas, queues, RPC frameworks — can be built by anyone, on top of AMS, without fighting AMS.

This is why one-to-many fan-out is the trivial case in AMS, not a special feature. A model emits a token stream; N subscribers all receive it in real time. A coordinator agent listens. A logger listens. A UI listens. A downstream worker listens. Same emission, no replication logic. Token streaming is what models already do natively; AMS just removes the wire that used to break it.

### 3.2 Magic Link as URL

A magic link is a URL. Not an opaque blob, not a JWT, not a custom envelope — a URL.

```
https://ams.covenant.dev/klappy/conversations/falcon-pulse-9421?t=eyJhbGc...
```

Three parts:

- **Origin (`https://ams.covenant.dev`)** — which AMS instance hosts the conversation. Discovery is solved trivially: the URL is the address.
- **Path (`/klappy/conversations/falcon-pulse-9421`)** — `<account-namespace>/conversations/<conversation-name>`. The account namespace makes ownership visible in the URL itself and eliminates the global-namespace collision problem. Anyone reading a magic link knows whose conversation it is.
- **Token (`?t=...`)** — a permissive bearer token granting permission to attach a stream and listen to the conversation. Default-on for every issued URL; future authorization policies (e.g. fully public conversations) can drop or replace it.

The conversation name itself is a **namespace alias** for an underlying identifier. Two identifier flavors are supported:

- **Flat UUID** — generated at conversation creation. The default. The alias is just a friendlier handle.
- **Deterministic JCS-SHA** — content-addressable hash of canonicalized inputs (JSON Canonicalization Scheme + SHA-256). Useful when two parties need to *independently arrive* at the same conversation ID by hashing the same canonical input — for example, "the conversation about spec X" without prior coordination.

The protocol treats the URL as opaque from the *client's* perspective: do not parse it, do not infer structure, just present it intact when joining. URL structure is a deployment-side choice. Other AMS implementations may use different URL shapes without breaking conformance, as long as the URL routes to a conversation and carries (or does not carry) the permissive token.

**Two doors at registration:**

1. **Magic link presented** → AMS knows which conversation to join.
2. **Account credentials presented** → AMS knows whose stream to bind.

The magic link is a bearer token for conversation access. The account credential is proof of who owns the stream being bound. One unlocks the conversation. The other unlocks your write surface inside it.

### 3.3 Wake-Up Semantics

Subscribers do not have to be live and listening to participate. A magic link can be configured to **wake** a dormant subscriber when tokens arrive. Sleep until called. Wake when needed. Same primitive, no extra layer. (Cloudflare Workers and Durable Objects already give us this for free at the infrastructure layer.)

### 3.4 Metadata, Annotations, and Capabilities

Streams and conversations each carry a single **metadata** slot — a JSON object. AMS owns the slot. AMS does not own its contents.

The slot does two jobs.

**It introduces peers to each other.** When a stream joins a conversation, its metadata rides on the join event. Every subscriber sees, immediately, what the new peer says about itself — its role, its display name, its version, anything it wants to announce. There is no separate handshake, no out-of-band registry lookup, no waiting for the first message to infer who showed up. The room knows.

**It carries declared capabilities.** One well-known key — `capabilities` — is reserved by convention as the slot where a stream declares what it can do. The schema of `capabilities` itself is application-defined; AMS never validates it. Two agents in the same conversation can declare entirely different capability sets, and they collaborate on whatever subset they share. If a stream's capabilities change mid-conversation — a tool became available, a model was upgraded, a role transitioned — it emits a metadata update and every peer is notified on the wire.

This is deliberately *not* a conversation-level capability registry. **The conversation has no canonical capability set.** Each stream declares per-stream; agents read peer metadata and converge on a working agreement themselves. Re-negotiation is a metadata write — no new protocol primitive, no extra round-trip, no central authority. Different streams in the same conversation may negotiate different effective contracts depending on use case.

Everything in the metadata slot that isn't `capabilities` is an **annotation** — free-form fields the stream's owner uses to describe itself. AMS broadcasts annotations exactly as it broadcasts capabilities; what they mean is between the agents.

The vodka contract holds: the protocol owns a generic slot and a broadcast guarantee. Schema, semantics, and negotiation logic live above the wire, in whatever sister-spec or convention the agents agree to follow.

---

## 4. The Inverted Inbox

Most messaging systems are built around inboxes. Anyone writes to your inbox; you read it; you spend half your life filtering out the clutter. Email. Slack DMs. SMS. All of them inherit this from physical mail.

AMS inverts that. **You own your writes, not your reads.**

- You write to your stream. Nobody else can write there.
- Other subscribers read your stream by being in the same conversation. You do not curate, filter, or accept incoming messages — incoming messages do not exist in this model.
- If you do not want to hear from someone, you leave their conversation. Or you do not enter it.

This is the right shape for real-time, because real-time has no time for triage. It also makes the security model dramatically simpler: there is no inbox to flood, no spam vector to plug, no permission grant to revoke. You either share a conversation with someone or you do not.

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

Many useful runtimes — agent frameworks, chat platforms, webhook consumers, devices speaking proprietary protocols — cannot themselves hold a WebSocket or speak the wire. The pattern for bringing them in is the **edge wrapper**: a thin, per-session subscriber that holds the wire WebSocket on the runtime's behalf and translates I/O patterns. The wire stays exactly as `PROTOCOL.md` says it is; the wrapper does the cut-and-adapt for whatever the runtime can actually hold. The MCP-wrapped reference deployment is the canonical instance of this pattern. See [`PATTERNS.md`](./PATTERNS.md) §2.

### 5.1 Spec vs Instance

For one specific subscriber type — reasoning agents — there is a layering distinction that recurs everywhere and is worth naming carefully.

An **agent spec** is the recipe: a system prompt, a tool definition, a model identifier, any other bootstrap configuration. It is immutable and verifiable — typically content-addressed by a hash of the canonical bootstrap (a JCS-SHA over `{system_prompt, tools, model, ...}`). The spec persists. The spec is what you mean when you say "the same agent."

An **agent instance** is a running execution of that spec: a process, a session, a Worker invocation, a container, whatever runs the inference loop. Instances are ephemeral. Instances spawn, do work, sleep, and terminate. Many instances may execute the same spec; many specs may run on the same hardware. The instance is what is on the wire at this moment.

These are **orthogonal**, not competing. Spec answers "what is this agent." Instance answers "which copy of it is acting right now." Both have identifiers; both matter; neither replaces the other. Identity-as-spec gets you reproducibility, audit, and equivalence-checking ("did the same agent answer twice"). Identity-as-instance gets you provenance ("which run produced this output") and lifecycle ("this instance crashed; spawn another from the same spec").

AMS does not enforce this distinction or even know it exists. AMS just carries tokens. But the pattern matters because it is the bridge between "AMS exists" and "agent runtimes can spawn deterministic, named, verifiable agents on demand." See [`PATTERNS.md`](./PATTERNS.md) for the deterministic harness pattern that makes it concrete.

---

## 6. The Agentic Stack

TCP/IP works because each layer solves one problem and stays out of the way of the others. The agentic world needs the same discipline. Below is the stack we believe needs to exist. AMS solves the bottom of it stupid-simple. The rest are real problems people are already building real businesses around — and they are mostly building them entangled, instead of orthogonal.

| Layer | Concern | Loose TCP/IP Analog | AMS Stance |
|---|---|---|---|
| **Transport** | Move bytes between two endpoints | Physical / Link | WebSocket to start. Swappable. |
| **Conversation + Stream** | Pub-sub coordination, magic-link addressing, write ownership | (no clean analog — closest is multicast with per-source channels) | **AMS owns this.** Stupid simple. |
| **Account / Identity** | Who owns this stream? | (none — TCP/IP punts to DNS + TLS) | Account is required. Identity scheme above account is negotiable. |
| **Discovery** | How do I find a conversation or account I have not met? | DNS | URL is the address. Optional registry above that. |
| **Capability Negotiation** | What protocols / formats do we both speak? | (TLS handshake, content negotiation) | Each stream declares its capabilities in its metadata (§3.4); peers read the declarations and converge themselves. AMS carries the declarations; the schema lives above. |
| **Authorization** | Who can join the conversation? Who can read which streams? | (none — left to applications) | Magic-link bearer + account auth in the PoC. Richer policies are pluggable. |
| **Observability** | What is happening across conversations? | (none — out-of-band) | Subscribers can be observability sinks. AMS does not push or pull telemetry. |
| **Job Coordination** | Queues, dependencies, parallelism | (application layer) | Above AMS, not in AMS. |
| **Identity** | Who an agent *is*, beyond an account ID | (none) | Above AMS. Negotiated between subscribers via docs endpoints. |

The contract: **AMS owns rows two and three only.** Everything else is a layer above it that some subscriber, framework, or vertical product implements in whatever way fits its use case. AMS does not have an opinion.

---

## 7. The PoC

What we are shipping by end of next week.

### 7.1 Scope

A single Cloudflare Worker, backed by a Durable Object per conversation, that:

1. Provides `POST /{namespace}/conversations` to mint a new conversation and return a magic link URL.
2. Provides a WebSocket endpoint that takes the magic link plus an account credential, binds the connection's stream to the conversation, and joins the subscriber to the broadcast loop.
3. Forwards every token written to any stream in the conversation to every subscriber in that conversation, tagged with the writing account / stream identifier so receivers know who wrote what.

That is the entire PoC.

**Stubbed for the PoC, real later:** account auth (the PoC accepts any string as an account ID and trusts it; production binds accounts to verified credentials). No revocation, no expiry, no per-stream ACLs, no federation, no registry, no JCS-SHA derivation (UUID only).

### 7.2 Stack

- **Cloudflare Worker** for HTTP entry and URL routing.
- **Durable Object per conversation** to hold the WebSocket connections and the broadcast loop.
- **D1 (or KV)** for the minimal account stub and conversation metadata (alias → identifier mapping).
- Token format: opaque bytes. The protocol does not care.

### 7.3 What It Proves

- Two agents (mine, Ian's), each with their own account, can be handed a magic link URL and start exchanging tokens through their owned streams in real time, with no copy-paste, no Signal, no human in the wire.
- The same conversation works for non-agent subscribers — a Worker, a curl command, a sensor — without protocol changes.
- The broker is small enough (target: under 300 lines including the DO) that the *foundation* is obviously not the interesting part. The interesting part is what gets built on top.

### 7.4 What It Does Not Prove (Yet)

- Real account auth. Bearer-string equivalence in the PoC.
- Discovery beyond "the URL is the address."
- JCS-SHA derived conversation identifiers. UUID only in the PoC.
- Authorization beyond magic link possession + account self-assertion.
- Cross-broker federation. One Worker, one account namespace.
- Scale. The PoC is for *correctness* of the primitive, not throughput.

These are explicit non-goals for week one. They are layers, and they bolt on.

---

## 8. Non-Goals (Forever, Not Just Week One)

To stay vodka, AMS will *never* take an opinion on:

- **What identity scheme accounts use above the account ID itself.** AMS carries identity declarations. It does not validate the upper schemes.
- **What schema stream metadata or declared capabilities take.** AMS carries the metadata slot and broadcasts changes. The shape of `capabilities` and any other annotation is application-defined.
- **What authorization policy a conversation enforces beyond the two-door minimum.** Magic link + account ownership is the floor. Anything richer is declared in conversation metadata.
- **What format tokens take.** Opaque bytes.
- **What transport layer is "correct."** WebSocket today. Swappable.
- **What queue or coordinator sits above it.** Job coordination is not in the protocol.
- **Whether the registry is centralized, federated, or distributed.** The PoC has no registry. Production deployments can pick.
- **What pricing dimension applies.** The hosted instance(s) bill on whatever dimension makes sense (likely concurrency-tiered). The protocol itself is free.
- **What URL structure other AMS implementations use.** The reference impl picks one. Conformance only requires that the magic link route to a conversation and authorize stream attachment.

This list is the contract. Every time someone proposes an addition, it gets checked against this list. If it would make AMS opinionated about one of these, the answer is no — that belongs in a layer above.

---

## 9. Open Questions

Honest things we do not yet know, and which the PoC will not answer:

- **Magic link revocation.** Once a link is issued, it works forever. Do we add expiry to the PoC, or wait until someone needs it?
- **Conversation persistence.** When the last subscriber disconnects, does the conversation evaporate or persist? PoC default: evaporate.
- **Stream replay.** When a subscriber joins late, do they get the conversation's recent token history or only what arrives after they connect? PoC default: from-now-only.
- **Multi-stream-per-account.** Can one account own multiple streams in the same conversation? Probably yes, named by the account. PoC default: one stream per account per conversation.
- **JCS-SHA collision and canonicalization scope.** When deterministic IDs land, what gets included in the canonical input? Schema TBD before the feature ships.
- **Federation.** Two brokers, one conversation. Possible, not solved. Probably needs a federation protocol layer.
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
- A Cloudflare Queue can sit above an AMS conversation as the job-coordination layer. AMS does not replace Queues; it feeds them.

The right framing: **Cloudflare services are first-class subscribers in AMS.** Anyone building on AMS gets immediate access to the entire Cloudflare ecosystem as plug-in subscribers. That is a feature, not a competitive overlap.

### 11.2 vs. Mem Zero and the Opinionated Stacks

Mem Zero raised $16M to build *agent memory*. Other startups are building agent identity, agent observability, agent orchestration. Each one owns a slice of the stack vertically — they ship the storage, the API, the identity layer, the routing, all bundled.

AMS does the opposite. We ship one slice, **the dial tone**, and we make it possible for every other vendor's slice to plug into ours. Long-term, that is a more defensible position than any single vertical, because every vertical needs the dial tone and nobody else is bothering to build it as foundation.

### 11.3 vs. Matrix, Mastodon, and Human Messaging Protocols

We considered just adapting Matrix, Mastodon, or similar federated human-messaging protocols. The base layer of those protocols is close to what we want. The problem is the human-layer assumptions baked in above it: presence, typing indicators, read receipts, threads, mentions, channels-as-topics, archival semantics.

Stripping all of that out is a bigger project than building the agent-native version from scratch. We respect the prior art. We are not borrowing from it.

### 11.4 vs. MCP

MCP is how a single agent calls tools and reads resources. AMS is how multiple agents (and other subscribers) talk to each other. MCP is one-to-one (agent ↔ tool); AMS is many-to-many (agents ↔ conversations ↔ subscribers). They compose: an agent reaches out via MCP to read a database, then emits the result on its AMS stream so other subscribers can react.

---

## 12. Naming

**AMS** stands for **Agent Messaging Service**. The acronym deliberately echoes SMS: a primitive, ubiquitous, dumb-pipe substrate that nobody thinks about because it just works. The echo is at the acronym level only — SMS carries messages, AMS carries tokens (see §3.1 for why). SMS does not know what your text means. Neither does AMS.

The protocol is open. The reference implementation is open. The hosted instance(s) are commercial.

We are not selling phones. We are selling the dial tone.
