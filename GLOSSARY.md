# AMS Glossary

The vocabulary AMS uses. If a word appears in any AMS document, it is defined here.

When in doubt, use these terms exactly. Synonyms invite drift.

---

**Account.** The identity that owns streams and pays for concurrency. A human, a team, or an autonomous agent may hold an account. Created via `POST /v1/accounts`. Identified by `account_id`. Authenticated via a bearer credential.

**Broadcast loop.** The mechanism inside a Room Durable Object that takes a token emitted on any stream in a room and pushes it to every connected subscriber.

**Capability negotiation.** The runtime process by which two agents in a room compare their published docs endpoints and agree on a common protocol or message format. Not part of the AMS protocol itself; a layer above.

**Credential.** The bearer token returned at account creation. Shown exactly once. Used in the `Authorization` header for all authenticated requests.

**Dial tone.** Metaphor. The thing AMS provides: an always-available, semantically empty channel that lets meaningful conversation happen on top.

**Docs endpoint.** A URL served *by an agent* (not by AMS) that declares what protocols, formats, identity schemes, and authorization the agent supports. Used for capability negotiation between agents in a room.

**DOLCHE journal.** External term, from oddkit. Decisions, Observations, Learnings, Constraints, Handoffs, Encoding. AMS borrows the journal-as-observability pattern: emit metadata about traffic to a journal without intercepting payloads.

**Emitter.** Anything that writes tokens to a stream. The owner of that stream's account is the only entity that may emit on it.

**Federation.** Hypothetical future capability: two AMS instances cooperating so that a room can span both. Not in the PoC. Will require its own protocol layer.

**Hosted instance.** A running deployment of AMS that other parties pay to use. Covenant runs the reference hosted instance. Other organizations may run their own.

**Inverted inbox.** Conceptual contrast. Email and chat assume writers push into your inbox and you sort the clutter. AMS inverts that: you own your stream, others choose to listen. No inbox, no clutter.

**Magic link.** The opaque token that addresses a room and grants permission to attach a stream and read all streams in the room. Format is implementation-defined; protocol treats it as opaque. Shareable via any out-of-band channel.

**Polymorphic subscriber.** The property that any kind of entity — agent, function, IoT device, human — can be a subscriber. AMS does not type-check the subscriber.

**Reference implementation.** The Cloudflare-Workers-based AMS instance shipping under Covenant. Open source. Other implementations are expected and welcome.

**Room.** A bound set of streams that share a magic link. All subscribers in a room read all streams in the room (subject to per-room authorization policy). Identified by `room_id`. Created via `POST /v1/rooms`.

**Room admission.** The check that decides whether a particular account can join a particular room. Default: anyone holding the magic link plus a valid account credential.

**Stream.** A single writer's real-time output within a room. Owned by exactly one account. Identified by `stream_id`, optionally named via `stream_name`. An account may own multiple streams in the same room.

**Stream readability.** The check that decides whether a particular subscriber can see tokens emitted on a particular stream. Default: every subscriber in the room sees every stream.

**Subscriber.** Anything connected to a room and reading tokens from streams. A subscriber may also be an emitter (if it owns a stream in the same room) or read-only (if not).

**Token.** The smallest unit of transmission in AMS. Opaque to the protocol. May be up to 64 KiB in the PoC. The application defines what `data` means.

**Vodka architecture.** Internal canon. Generic, unopinionated, swappable. The opposite of "flavored" — i.e. baked-in domain assumptions. AMS is vodka by design at every layer it owns.

**Wake-up surface.** Property of a room: incoming tokens can spin up a dormant subscriber rather than requiring it to be already connected. Same protocol, no extra mechanism — just a subscriber implementation choice.

**Writer.** Synonym for emitter, used when describing the ownership relationship: "the writer of stream X is account Y."

---

## Terms We Deliberately Do Not Use

- **Channel.** Replaced by *room*. "Channel" was used in early drafts and overloads heavily with Slack, Discord, IRC, and broadcast media.
- **Inbox.** AMS does not have inboxes. It has streams that subscribers choose to read.
- **Topic.** Used in Kafka / NATS / pub-sub literature. AMS uses *room* + *stream* instead, because the ownership model is fundamentally different.
- **Message.** Avoided in favor of *token*. "Message" implies more semantics than the protocol provides.
- **Connection** (as a noun for the conceptual link). AMS connections are physical WebSocket connections; the conceptual unit is the *stream*.
