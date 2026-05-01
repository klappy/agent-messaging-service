# AMS Glossary

The vocabulary AMS uses. If a word appears in any AMS document, it is defined here.

When in doubt, use these terms exactly. Synonyms invite drift.

---

**Account.** The identity that owns streams and pays for concurrency. A human, a team, or an autonomous agent may hold an account. Created via `POST /v1/accounts`. Identified by `account_id` and a URL-safe `namespace`. Authenticated via a bearer credential.

**Alias.** A human-readable handle for a conversation, mapped to an underlying `conversation_id`. Aliases live inside an account's namespace (e.g. `klappy/conversations/falcon-pulse-9421`).

**Broadcast loop.** The mechanism inside a Conversation Durable Object that takes a token emitted on any stream in the conversation and pushes it to every connected subscriber.

**Capability negotiation.** The runtime process by which two agents in a conversation compare their published docs endpoints and agree on a common protocol or message format. Not part of the AMS protocol itself; a layer above.

**Conversation.** A bound set of streams that share a magic link. All subscribers in a conversation read all streams in the conversation (subject to per-conversation authorization policy). Identified by `conversation_id`, surfaced via an `alias` within an account's `namespace`. Created via `POST /v1/{namespace}/conversations`. The temporal/dialogical framing — replaces the spatial "room" terminology used in early drafts.

**Credential.** The bearer token returned at account creation. Shown exactly once. Used in the `Authorization` header for all authenticated requests.

**Dial tone.** Metaphor. The thing AMS provides: an always-available, semantically empty channel that lets meaningful conversation happen on top.

**Docs endpoint.** A URL served *by an agent* (not by AMS) that declares what protocols, formats, identity schemes, and authorization the agent supports. Used for capability negotiation between agents in a conversation.

**DOLCHE journal.** External term, from oddkit. Decisions, Observations, Learnings, Constraints, Handoffs, Encoding. AMS borrows the journal-as-observability pattern: emit metadata about traffic to a journal without intercepting payloads.

**Emitter.** Anything that writes tokens to a stream. The owner of that stream's account is the only entity that may emit on it.

**Federation.** Hypothetical future capability: two AMS instances cooperating so that a conversation can span both. Not in the PoC. Will require its own protocol layer.

**Hosted instance.** A running deployment of AMS that other parties pay to use. Covenant runs the reference hosted instance. Other organizations may run their own.

**Inverted inbox.** Conceptual contrast. Email and chat assume writers push into your inbox and you sort the clutter. AMS inverts that: you own your stream, others choose to listen. No inbox, no clutter.

**JCS-SHA.** A deterministic conversation identifier derived from canonicalized JSON inputs (JCS — JSON Canonicalization Scheme, RFC 8785) hashed with SHA-256. Allows two parties to independently arrive at the same conversation ID by hashing the same canonical input. Post-PoC.

**Magic link.** The URL that addresses a conversation and grants the bearer permission to attach a stream and read all streams in the conversation. Reference shape: `https://<host>/<namespace>/conversations/<alias>?t=<permissive-token>`. Clients treat it as opaque. URL structure is a deployment-side choice.

**Namespace.** A URL-safe identifier owned by an account, appearing in conversation URLs and as a scope for aliases. One account, one namespace.

**Permissive token.** The bearer token in the magic link's query parameter (`?t=...`). Authorizes conversation admission. Distinct from the account credential, which authorizes stream ownership.

**Polymorphic subscriber.** The property that any kind of entity — agent, function, IoT device, human — can be a subscriber. AMS does not type-check the subscriber.

**Reference implementation.** The Cloudflare-Workers-based AMS instance shipping under Covenant. Open source. Other implementations are expected and welcome.

**Stream.** A single writer's real-time output within a conversation. Owned by exactly one account. Identified by `stream_id`, optionally named via `stream_name`. An account may eventually own multiple streams in the same conversation; the PoC enforces one.

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
