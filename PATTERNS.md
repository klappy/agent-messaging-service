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

## 2. (Future Patterns)

Patterns we expect to document here as they land:

- **Observability sink** — a subscriber that listens to many conversations, redacts payloads, and ships metadata to a journal store (DOLCHE-shaped, see oddkit).
- **Job queue bridge** — a subscriber that fans tokens into a real durable queue (Cloudflare Queues, RabbitMQ, SQS) for async processing.
- **IoT control plane** — IoT devices as subscribers, emitting sensor tokens and consuming command tokens.
- **Human-in-the-loop bridge** — a subscriber that translates between AMS and a human-facing channel (SMS, web UI, voice). Useful for human approval gates inside otherwise-autonomous agent flows.
- **Federation gateway** — a subscriber that bridges two AMS instances, making cross-broker conversations possible. Closely related to the federation open question in [`AMS.md`](./AMS.md) §9.
- **Spec registry** — a subscriber that maintains a public registry of agent specs by hash, decoupled from AMS itself. Lets harnesses fetch specs by ID without inlining them.

Each of these will get its own subsection here once it has been built or thought through carefully.
