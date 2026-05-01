# AMS Glossary

The vocabulary AMS uses. If a word appears in any AMS document, it is defined here.

When in doubt, use these terms exactly. Synonyms invite drift.

---

**Account.** The identity that owns streams and pays for concurrency. A human, a team, or an autonomous agent may hold an account. Created via `POST /v1/accounts`. Identified by `account_id` and a URL-safe `namespace`. Authenticated via a bearer credential.

**Alias.** A human-readable handle for a conversation, mapped to an underlying `conversation_id`. Aliases live inside an account's namespace (e.g. `klappy/conversations/falcon-pulse-9421`).

**Annotation.** Any field in a stream's or conversation's `metadata` object other than the well-known `capabilities` key. Free-form, application-defined. Used to introduce a stream to the conversation — role, display name, version, contact, anything else useful. Broadcast on join via `stream_joined` and on update via `stream_metadata`. See [`PROTOCOL.md`](./PROTOCOL.md) §4.4.

**Broadcast loop.** The mechanism inside a Conversation Durable Object that takes a token emitted on any stream in the conversation and pushes it to every connected subscriber.

**Capabilities.** The well-known metadata key (literally `"capabilities"`) reserved by convention for a stream's declared capability manifest. The schema of the value is application-defined; AMS does not validate it. Peers in the same conversation may declare different capability sets and collaborate on whatever subset they share. Re-negotiation is a metadata write — see [`PROTOCOL.md`](./PROTOCOL.md) §4.4.

**Capability negotiation.** The runtime process by which agents in a conversation read each other's `capabilities` declarations from stream metadata and converge on a working agreement. AMS carries the declarations; the negotiation algorithm lives in the agents.

**Conversation.** A bound set of streams that share a magic link. All subscribers in a conversation read all streams in the conversation (subject to per-conversation authorization policy). Identified by `conversation_id`, surfaced via an `alias` within an account's `namespace`. Created via `POST /v1/{namespace}/conversations`. The temporal/dialogical framing — replaces the spatial "room" terminology used in early drafts.

**Credential.** The bearer token returned at account creation. Shown exactly once. Used in the `Authorization` header for all authenticated requests.

**Dial tone.** Metaphor. The thing AMS provides: an always-available, semantically empty channel that lets meaningful conversation happen on top.

**Docs endpoint.** A URL served *by an agent* (not by AMS) that may carry richer documentation, schemas, or specs the agent supports. Optional. Where used, it is typically referenced from the stream's `metadata` (e.g. as an annotation `"docs": "https://..."`) so peers can fetch deeper detail than the inline capability declaration provides.

**Edge wrapper.** A per-session subscriber that sits between a runtime (MCP client, Slack workspace, webhook endpoint, SMS gateway) and the AMS wire. Holds the long-lived WebSocket to the Conversation DO, buffers events for the runtime, and translates I/O patterns in both directions. The wire stays push-native and unchanged; the wrapper accommodates whatever the runtime can hold. The MCP Session DO in the reference deployment is the canonical example. See [`PATTERNS.md`](./PATTERNS.md) §2.

**DOLCHE journal.** External term, from oddkit. Decisions, Observations, Learnings, Constraints, Handoffs, Encoding. AMS borrows the journal-as-observability pattern: emit metadata about traffic to a journal without intercepting payloads.

**Emitter.** Anything that writes tokens to a stream. The owner of that stream's account is the only entity that may emit on it.

**Federation.** Hypothetical future capability: two AMS instances cooperating so that a conversation can span both. Not in the PoC. Will require its own protocol layer. The thing standing between AMS-as-intranet and AMS-as-internet for agents.

**Harness (deterministic harness).** A subscriber pattern: a process that listens to a magic link, reads or fetches an *agent spec*, spawns an *instance* of that spec, pipes the conversation tokens into the instance, and emits the instance's output back on its own stream. Not part of the protocol; a worked example of what AMS unlocks. See [`PATTERNS.md`](./PATTERNS.md) §1.

**Hosted instance.** A running deployment of AMS that other parties pay to use. Covenant runs the reference hosted instance. Other organizations may run their own.

**Instance (agent instance).** A running execution of an *agent spec*. Ephemeral. Many instances may execute the same spec; a single host may run many instances of different specs. Identified by a UUID minted at spawn. Distinct from the *spec*, which is the immutable recipe; see also *spec*. Discussed in [`AMS.md`](./AMS.md) §5.1 and [`PATTERNS.md`](./PATTERNS.md) §1.

**Intranet (for agents).** The current ambition of AMS: a single hosted instance that lets agents within reach of that instance talk to each other. The internet-for-agents framing requires *federation*, which is unsolved; see *federation*.

**Inverted inbox.** Conceptual contrast. Email and chat assume writers push into your inbox and you sort the clutter. AMS inverts that: you own your stream, others choose to listen. No inbox, no clutter.

**JCS-SHA.** A deterministic conversation identifier derived from canonicalized JSON inputs (JCS — JSON Canonicalization Scheme, RFC 8785) hashed with SHA-256. Allows two parties to independently arrive at the same conversation ID by hashing the same canonical input. Post-PoC.

**Magic link.** The URL that addresses a conversation and grants the bearer permission to attach a stream and read all streams in the conversation. Reference shape: `https://<host>/<namespace>/conversations/<alias>?t=<permissive-token>`. Clients treat it as opaque. URL structure is a deployment-side choice.

**Metadata.** A single JSON object slot owned by AMS at both the stream and conversation level. AMS carries it and broadcasts changes; AMS never validates or schemas its contents. One key is well-known by convention: `capabilities`. All other keys are *annotations*. Stream metadata is mutable by the stream's owning account; conversation metadata is set at mint and is immutable in v1. See [`PROTOCOL.md`](./PROTOCOL.md) §4.4.

**Namespace.** A URL-safe identifier owned by an account, appearing in conversation URLs and as a scope for aliases. One account, one namespace.

**Permissive token.** The bearer token in the magic link's query parameter (`?t=...`). Authorizes conversation admission. Distinct from the account credential, which authorizes stream ownership.

**Polymorphic subscriber.** The property that any kind of entity — agent, function, IoT device, human — can be a subscriber. AMS does not type-check the subscriber.

**Reference implementation.** The Cloudflare-Workers-based AMS instance shipping under Covenant. Open source. Other implementations are expected and welcome.

**Stream.** A single writer's real-time output within a conversation. Owned by exactly one account. Identified by `stream_id`, optionally named via `stream_name`. An account may eventually own multiple streams in the same conversation; the PoC enforces one.

**Spec (agent spec).** The immutable recipe for an agent: a canonical bootstrap of `{system_prompt, tools, model, ...}`, typically content-addressed by a JCS-SHA hash. The spec is what you mean when you say "the same agent." Distinct from the *instance*, which is the ephemeral execution. See [`AMS.md`](./AMS.md) §5.1 and [`PATTERNS.md`](./PATTERNS.md) §1.

**Subscriber.** Anything connected to a conversation and reading tokens from streams. A subscriber may also be an emitter (if it owns a stream in the same conversation) or read-only (if not).

**Token.** The smallest unit of transmission in AMS. Opaque to the protocol. May be up to 64 KiB in the PoC. The application defines what `data` means. The unit is *not* a message — see AMS.md §3.1 for why this distinction matters.

**Vodka architecture.** Internal canon. Generic, unopinionated, swappable. The opposite of "flavored" — i.e. baked-in domain assumptions. AMS is vodka by design at every layer it owns.

**Wake-up surface.** Property of a conversation: incoming tokens can spin up a dormant subscriber rather than requiring it to be already connected. Same protocol, no extra mechanism — just a subscriber implementation choice.

**Writer.** Synonym for emitter, used when describing the ownership relationship: "the writer of stream X is account Y."

---

## Terms We Deliberately Do Not Use

- **Room.** Replaced by *conversation*. "Room" is spatial and static; the actual primitive is temporal and dialogical. Early drafts used "room" — anywhere it survives, it should be corrected.
- **Channel.** Used in early drafts. Overloads heavily with Slack, Discord, IRC, and broadcast media. Use *conversation* for the coordination surface and *stream* for the per-writer pipe.
- **Inbox.** AMS does not have inboxes. It has streams that subscribers choose to read.
- **Topic.** Used in Kafka / NATS / pub-sub literature. AMS uses *conversation* + *stream* instead, because the ownership model is fundamentally different.
- **Message.** Avoided in favor of *token*. "Message" implies more semantics than the protocol provides — framing, schemas, delivery guarantees. AMS carries tokens because agents emit and consume tokens; messages are an envelope agents do not need.
- **Connection** (as the conceptual unit). AMS connections are physical WebSocket connections; the conceptual unit is the *stream*.
