# Patterns

Patterns that emerge once AMS exists. Not part of the protocol. Not features AMS owns. Documented here so the dial-tone metaphor is easier to see in practice — if you can build it on top of AMS, the document goes here, not in [`PROTOCOL.md`](./PROTOCOL.md).

This file will grow over time. The first entry is the foundational one.

---

## 1. The Deterministic Harness

**The pattern.** Anything subscribed to a magic link can read tokens off it. If those tokens (or the conversation metadata) describe an *agent spec* — a content-addressed bootstrap of `{system_prompt, tools, model, ...}` — the subscriber can spawn a fresh agent instance from that spec, route the conversation's tokens into it, and let it act. The instance writes its output back on its own stream. The spec is immutable; the instance is ephemeral.

```
Magic Link  ─────►  Subscriber (the harness)
                         │
                         │  1. Read incoming tokens
                         │  2. Verify spec hash
                         │  3. Spawn instance from spec
                         │  4. Pipe tokens to instance
                         │  5. Pipe instance output to its stream
                         │  6. Sleep / terminate when done
                         ▼
                    Spec (immutable)  ─►  Instance (ephemeral)
                       hash:abc123        process / Worker / container
```

**Why it matters.** This is the bridge between "AMS exists" and "agent runtimes can spawn deterministic, named, verifiable agents on demand." Today, orchestration is bolted into the runtime — Claude Code's orchestration layer, Microsoft Bot Framework's orchestration layer, etc. — and every framework owns its own. The deterministic harness collapses orchestration into a *subscriber pattern*: anyone can be the orchestrator because anyone can subscribe to a magic link and decide what spawns.

**Agent vs Instance, in this pattern.**

- The *spec* is the addressable identity. Two harnesses anywhere in the world can hash the same canonical bootstrap, get the same spec ID, and spawn provably-equivalent agents. This is what gives you reproducibility, audit trails, and equivalence checks.
- The *instance* is the addressable execution. Each instance gets its own stream so receivers can tell which run produced which output, even when many instances of the same spec are live.

The two are orthogonal, not competing. AMS-level identity goes through the *account*; spec-level identity goes through the *hash*; instance-level identity is whatever the harness mints (UUID is fine). All three coexist on every token a harnessed agent emits.

**What AMS does not provide.**

- AMS does not define the spec format. That is a harness convention.
- AMS does not verify spec hashes. That is a harness responsibility.
- AMS does not run agents. AMS just carries tokens to and from whatever does run them.

**What AMS does provide that makes this work.**

- A real-time token channel between the orchestrator (whatever decides to spawn) and the harness (whatever spawns).
- Polymorphic subscribers, so the spawning decision can come from any source — another agent, a Worker, a webhook, a human.
- Per-stream write ownership, so an instance's output is unambiguously attributable to that instance.
- The wake-up surface, so the harness can be dormant until tokens arrive on the conversation.

**Open questions in this pattern.**

- *Spec canonicalization.* What is in the canonical bootstrap? `system_prompt + tools + model` is the minimum; runtime parameters (temperature, top-p) might or might not belong. Needs the same canonicalization pass as JCS-SHA conversation IDs.
- *Spec distribution.* The harness needs the spec to spawn the instance. Is the spec inlined in the conversation metadata, fetched from a known store, or carried as the first token? Probably a harness-level choice; AMS does not care.
- *Instance lifecycle authority.* Who decides when an instance terminates? The harness on a timeout? The orchestrator on a kill token? The instance itself? Likely all three, in different deployments.

These are problems for the harness ecosystem to solve. AMS already gave them the wire.

---

## 2. The Edge Wrapper

**The pattern.** AMS's wire is push-native, WebSocket-first, real-time. Most consumer runtimes are not — they're request/response, or they speak a different protocol entirely (MCP, HTTP webhooks, Slack events, SMS). Rather than reshape the wire to accommodate each runtime, place a thin per-session subscriber between the runtime and the wire. The wrapper holds a long-lived WebSocket to the conversation it serves, buffers events for the runtime, and translates I/O patterns in both directions.

```
Runtime (MCP client, Slack workspace, SMS gateway, ...)
    │
    │  whatever the runtime speaks
    │  (request/response, webhooks, events, etc.)
    ▼
Edge Wrapper (per-session subscriber)
    │
    │  • holds the wire WebSocket
    │  • per-session event buffer + cursor
    │  • subscription set
    │  • bidirectional I/O translation
    ▼
AMS Conversation (the dream-house wire, unchanged)
```

**Why it matters.** The wire spec gets to be exactly the shape AMS wants — push-native, opaque, broadcast — without compromising for any specific runtime's limitations. The Conversation DO does not have to know that some peers are MCP sessions, that some are webhook endpoints, that some are humans on SMS. It treats every subscriber the same: a WebSocket-holding entity that emits and receives wire frames. Each adapter is a single-purpose translator, and adding a new runtime is a new wrapper, not a protocol revision.

**Why it stays vodka.** The wrapper:

- Carries opaque tokens and opaque metadata. Same payload contract as the wire.
- Holds no persistent durable state — only ephemeral session state (buffer, cursor, subscription set), discarded when the session ends.
- Has no domain opinions. It does not parse `data`, schema-validate `metadata`, or branch on payload contents.
- Implements one well-defined contract over another. That is the entire job.

A wrapper that grows beyond translation — that adds caching, rewrites payloads, applies content policy, or accumulates business logic — has stopped being a wrapper and become a product. At that point it gets factored out as a separate service. The wrapper layer must stay cheap.

**The MCP wrapper as the canonical instance.** The reference deployment ships an MCP edge wrapper as a per-MCP-session Durable Object (`SessionDO` in [`POC-INFRA.md`](./POC-INFRA.md) §4). The Session DO holds the WebSocket to the Conversation DO, buffers wire events for the MCP client, and exposes the AMS surface as five MCP tools plus two notification streams. The Conversation DO does not know MCP exists.

**Other wrappers that fit the same shape.**

- **Slack adapter.** A per-Slack-channel Session DO that bridges Slack messages to AMS tokens and vice versa. Slack threads ↔ conversations.
- **Webhook adapter.** A per-subscription Session DO that POSTs incoming tokens to a configured URL and accepts outbound tokens via a return webhook.
- **SMS adapter.** A per-phone-number Session DO that sends outbound tokens via SMS and accepts inbound SMS as token emissions.
- **A2A bridge.** A Session DO that translates between AMS and the Agent2Agent protocol (or any other agent comms protocol that emerges).

Each of these is its own DO class implementing the same edge-wrapper contract. None of them require the wire spec to change.

**What the pattern does not provide.**

- AMS does not host runtimes. The wrapper bridges to a runtime; it does not run one.
- AMS does not validate what the wrapper carries. Translation fidelity is the wrapper's responsibility.
- AMS does not standardize wrapper APIs. Each wrapper exposes whatever is idiomatic for the runtime it serves.

**Open questions in this pattern.**

- *Wrapper authentication.* A wrapper acts as an AMS account; how does the wrapper itself prove which account it represents? In the reference impl, the MCP `Authorization` header is the AMS bearer credential — the agent's account is the wrapper's account. Other wrappers may need different binding mechanisms.
- *Wrapper failure semantics.* If the wrapper crashes mid-session, its buffer is lost. A future revision may add a cheap spill-to-storage tier, but not in v1.
- *Wrapper observability.* Should wrappers emit telemetry to a separate observability subscriber (the pattern in §3 below, eventually), or to a wrapper-specific log sink? Probably the former, but TBD.

These are wrapper-ecosystem questions. AMS already gave them the wire.

---

## 3. (Future Patterns)

Patterns we expect to document here as they land:

- **Observability sink** — a subscriber that listens to many conversations, redacts payloads, and ships metadata to a journal store (DOLCHE-shaped, see oddkit).
- **Job queue bridge** — a subscriber that fans tokens into a real durable queue (Cloudflare Queues, RabbitMQ, SQS) for async processing.
- **IoT control plane** — IoT devices as subscribers, emitting sensor tokens and consuming command tokens.
- **Human-in-the-loop bridge** — a subscriber that translates between AMS and a human-facing channel (SMS, web UI, voice). Useful for human approval gates inside otherwise-autonomous agent flows.
- **Federation gateway** — a subscriber that bridges two AMS instances, making cross-broker conversations possible. Closely related to the federation open question in [`AMS.md`](./AMS.md) §9.
- **Spec registry** — a subscriber that maintains a public registry of agent specs by hash, decoupled from AMS itself. Lets harnesses fetch specs by ID without inlining them.

Each of these will get its own subsection here once it has been built or thought through carefully.
