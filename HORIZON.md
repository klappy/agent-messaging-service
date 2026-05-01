# Horizon — What AMS Unlocks

> Token stream routing.

A catalog of use cases AMS makes possible and things to build on top of it. Each entry names *what it is*, *what AMS specifically enables that wasn't possible before*, and *what's needed beyond AMS to ship it*.

This is not the spec. The spec is [`SPEC.md`](./SPEC.md) — what we are committing to ship in the PoC. This doc is the design space the spec is the first move toward. Not a roadmap. Not a backlog. A map.

Comprehensive on purpose. The vodka discipline of the wire produces a substrate that is genuinely domain-agnostic; the consequence is that the catalog is wide. We are listing categories so we can see the shape, not promising to build all of them.

---

## The Architectural Shift That Makes All of This Possible

One inversion sits underneath every entry below.

In the current consumer-AI shape, the **browser** holds the long-lived connection to the model. The browser is the durable thing; everything else is plumbing. So when the browser hiccups — WiFi flicker, mobile backgrounding, a tab loses focus, an SSE timeout four hops upstream — the model carries on emitting tokens to a connection that no longer exists. The user gets the red bar of *response incomplete* and has no way to know whether the generation is still happening, finished, or lost.

Flip it. The **harness** becomes the durable thing. The harness owns the conversation, owns the AMS stream the model emits to, owns the long-lived relationship with the model. Every other participant — the browser, the phone, the colleague's window, the fact-checker agent, the logger, the audit subscriber — is a *re-attachable lens* onto the conversation. They subscribe. They drop. They reattach. The conversation is unchanged by their coming and going. Tokens never go to the abyss because they go to the conversation, which is observable, replayable, and persistent.

```
OLD:   browser ←──────────── model
        (fragile direct connection;
         if browser drops, generation is lost)

NEW:   browser ─→ subscribes to ─→ AMS conversation
                                       ↑
                                       │ harness ←→ model
                                       │ (the harness owns
                                       │  the long-lived
                                       │  relationship)
```

Once the conversation is the durable thing, the catalog below becomes possible. Different verticals dress different streams differently, but every entry in this doc is a consequence of the same shift.

---

## 1. Consumer / End-User Experience

### 1.1 Dropped-connection recovery

Generations no longer die when the browser hiccups. The harness keeps reading the model's stream; the conversation keeps broadcasting. When the browser reconnects, it rejoins the same conversation and catches up. The "response incomplete" red bar disappears as a category of UX failure.

- **What AMS enables:** the conversation outlives any single subscriber's connection.
- **What's needed beyond AMS:** a chat client that holds the magic link in account history; replay buffer (deferred in `SPEC.md` §5).

### 1.2 Cross-device continuity

Start a long generation on the desktop. Close the laptop. Open the phone an hour later. The phone subscribes to the same conversation, catches up, streams live.

- **What AMS enables:** any device can subscribe to a conversation by magic link without coordinating with other devices.
- **What's needed beyond AMS:** account history surfacing past conversations; identity tied to the AMS account across devices.

### 1.3 Background generation with notification

Kick off a complex generation. Walk away. Receive a push notification when the generation completes — the conversation says "done." Open it whenever convenient.

- **What AMS enables:** stream completion is a wire-observable event; subscribers don't need to be live to know it happened.
- **What's needed beyond AMS:** a notification subscriber that watches for stream completion events and emits a push notification.

### 1.4 Multi-window same conversation

Open the same conversation in three browser tabs (a long view, a code view, a notes view) — all subscribers to the same conversation, each rendering whatever subset of streams it cares about.

- **What AMS enables:** N subscribers per conversation, each independent, each drawing from the same broadcast.
- **What's needed beyond AMS:** UI conventions for which streams render where.

### 1.5 Pause and resume on demand

A "pause" button on agent thinking, mediated by the harness. The user emits a `pause` token; the harness stops feeding the model's output to subscribers (or buffers and holds). The user emits `resume`; output flows again.

- **What AMS enables:** control tokens flow on the same conversation as the data tokens; no separate channel needed.
- **What's needed beyond AMS:** harness-level support for pause/resume of model output.

### 1.6 Time-shifted listening

A long generation finished an hour ago; the user opens it now and reads at their own pace. The conversation is the artifact.

- **What AMS enables:** the conversation is durable past the live generation window.
- **What's needed beyond AMS:** conversation persistence past the last subscriber disconnect (open question in `AMS.md` §9; default is evaporate).

---

## 2. Collaboration Between Humans and Agents

### 2.1 Generation as shared artifact

Send a magic link to a colleague: *"watch this thinking session with me."* They join, see the tokens that already arrived, see new ones live, can subscribe their own agent to react.

- **What AMS enables:** the conversation is a shareable URL, not a private session; multiple humans can join simultaneously.
- **What's needed beyond AMS:** UI rendering of multi-stream conversations; permissions/visibility policy at the chat-product layer.

### 2.2 Pair programming with agents

Two developers, two coding agents, one shared conversation. Both humans see each other's prompts and each agent's output streams. Either human can interrupt either agent.

- **What AMS enables:** four-stream conversation with full mutual visibility; no one is "the host" in a privileged way.
- **What's needed beyond AMS:** an editor or terminal subscriber that pipes context (selected code, file paths) into the conversation as metadata or initial tokens.

### 2.3 Async research collaboration

A team kicks off a research generation in the morning. Members drop in throughout the day, see what the agent has produced, contribute follow-up prompts. The conversation persists across timezones.

- **What AMS enables:** the conversation outlives any single human's working session.
- **What's needed beyond AMS:** conversation persistence; some notion of "who's currently viewing" (presence — explicitly out of v1, but addable as a wrapper concern).

### 2.4 Meeting agent

An agent joins a Zoom/Meet call (via the meeting platform's webhook hook into an AMS edge wrapper), listens to the transcript stream, takes notes, summarizes. Other meeting participants subscribe via their phones to watch the notes accumulate live.

- **What AMS enables:** the meeting becomes a conversation with a transcript stream; downstream consumers (notes, action-item extractor, follow-up scheduler) all subscribe.
- **What's needed beyond AMS:** an edge wrapper that bridges the meeting platform to AMS (per `PATTERNS.md` §2).

### 2.5 Code review with agent participation

A pull request is a conversation. The author posts an opening token (the diff). A reviewer agent emits review comments as tokens on its own stream. Human reviewers see the agent's review live, respond, possibly modify the diff, the agent re-reviews.

- **What AMS enables:** review-as-conversation rather than review-as-discrete-comments; agents are first-class reviewers indistinguishable from humans at the protocol level.
- **What's needed beyond AMS:** a Git-host edge wrapper that translates between PR events and AMS streams.

### 2.6 Multiplayer thinking sessions

Two humans with personal agents in one conversation. Four streams. The humans talk to each other through their UIs; their agents collaborate on subtasks in parallel; everyone observes everyone.

- **What AMS enables:** N participants per conversation with no cap, no host privilege, full mutual visibility.
- **What's needed beyond AMS:** UI conventions for distinguishing human streams from agent streams visually.

---

## 3. Multi-Agent Systems

### 3.1 The hackathon-replay (origin)

Two agents on two machines exchange tokens through a magic link with no copy-paste, no human in the wire. The PoC's demo gate (`SPEC.md` §3.2). Everything else in this section is a generalization of this base case.

- **What AMS enables:** the foundational case — two agents reaching each other in real time across owners, machines, and stacks.
- **What's needed beyond AMS:** the MCP edge wrapper for agents that can't speak the wire directly (already in PoC scope).

### 3.2 Specialist coordination

A research agent gathers sources. A writer agent drafts from those sources. A fact-checker agent verifies the draft. All three subscribe to the same conversation. The writer reads the researcher's stream; the fact-checker reads both. Output is one collaboratively-produced document.

- **What AMS enables:** N-way agent collaboration without bilateral connections; each agent reads what's relevant from its peers' streams.
- **What's needed beyond AMS:** orchestration logic at the agent level (who calls whom in what order); capability declarations in stream metadata so agents know each other's roles.

### 3.3 Hierarchical agent teams

A manager agent receives a task on a top-level conversation. It spawns worker agents in sub-conversations (one per worker), delegates pieces of the task. Worker results flow back to the manager via a coordination conversation. The manager assembles the final output.

- **What AMS enables:** conversations as the coordination primitive; workers can be ephemeral and replaceable; the manager reasons over conversations as data.
- **What's needed beyond AMS:** manager-level reasoning patterns; spawn/lifecycle semantics for worker agents.

### 3.4 Agent crash recovery

A worker agent crashes mid-task. A new instance spawns from the same agent spec, joins the same conversation, reads what's already been done from the stream, resumes. The conversation does not notice the swap. Spec-vs-instance from `PATTERNS.md` §1 becomes load-bearing.

- **What AMS enables:** the conversation is the connective tissue between replaceable instances; state recovery from the wire.
- **What's needed beyond AMS:** spec-as-content-hash convention; harness-level instance lifecycle management.

### 3.5 Federated cross-org agent collaboration

A vendor's agent and a customer's agent need to coordinate on a shared task. They join the same conversation across organizational boundaries, declaring their respective accounts and capabilities, exchanging tokens under their own organizations' governance.

- **What AMS enables:** account-namespaced participation; capability declarations via metadata; the magic-link sharing model crosses organizational boundaries trivially.
- **What's needed beyond AMS:** federation between AMS instances (deferred in `SPEC.md` §5; needs its own protocol layer); inter-org identity verification above the account layer.

### 3.6 Agent marketplaces

An agent provider lists capabilities; a consumer joins a conversation that includes the provider's agent for a session. Pricing, billing, and SLA happen above AMS; the actual collaboration happens on the wire.

- **What AMS enables:** capability discovery via metadata; per-session participation; clean teardown when the session ends.
- **What's needed beyond AMS:** marketplace product (catalog, billing, SLA, reputation); identity scheme for vetted providers.

---

## 4. Governance and Oversight

### 4.1 Real-time fact-checker subscriber

A fact-checking agent joins the conversation, reads the model's stream, emits corrections on its own stream when it spots a hallucination or an unsourced claim. The user sees both streams interleaved.

- **What AMS enables:** governance as a *subscriber posture*, not an interceptor. The model is uninterrupted; corrections are alongside, not in the way.
- **What's needed beyond AMS:** the fact-checker agent itself; UI conventions for rendering correction streams visually.

### 4.2 Compliance and PII subscriber

A compliance subscriber reads every stream in the conversation, redacts PII or sensitive data, emits redacted versions on its own stream that downstream subscribers consume instead. The unredacted original stays only with the harness for audit purposes.

- **What AMS enables:** compliance is a wrapping subscriber that produces a parallel stream; it doesn't have to live in the model or the chat client.
- **What's needed beyond AMS:** the compliance subscriber implementation; chat-client logic to prefer redacted streams when present.

### 4.3 Cost monitor

A cost-tracking subscriber observes the model's stream, estimates token cost in real time, alerts when the conversation crosses configured thresholds, emits a `cost_warning` token visible to the user.

- **What AMS enables:** observability of every token enables cost calculation without instrumenting the model or the harness.
- **What's needed beyond AMS:** cost-model logic per provider; alerting infrastructure.

### 4.4 Quality gate

A gate subscriber reads the model's output, evaluates against quality criteria, emits a `block` token if the output fails — and the chat client honors the block by not rendering downstream content. Output that passes flows through unmodified.

- **What AMS enables:** quality control as a subscriber that emits control tokens; the model and the chat client never need to know each other's quality posture.
- **What's needed beyond AMS:** quality-eval logic; chat-client convention for honoring `block` tokens.

### 4.5 Audit logger (passive)

A passive logger subscribes to every conversation in an organization, writes every token + every metadata change to a DOLCHE journal in the customer's git repo. The audit trail is the conversation, by reference.

- **What AMS enables:** complete observability with no impact on conversation flow; the auditor is read-only and invisible.
- **What's needed beyond AMS:** the journal-writing subscriber; storage in customer-controlled git (TruthKit pattern).

### 4.6 A/B governance experiments

Two governance configurations subscribe to the same conversation in parallel. Each emits its corrections on its own stream. The user (or a researcher) sees both, compares, picks. Live A/B testing of governance posture without forking the conversation.

- **What AMS enables:** governance posture is a subscriber; you can run multiple in parallel without affecting the model or the chat client.
- **What's needed beyond AMS:** the governance configurations themselves; UI for displaying parallel governance streams.

---

## 5. Reliability and Operations

### 5.1 Hot-swap inference providers

The harness is currently routing the model's output via Provider A. Provider A starts rate-limiting. The harness silently switches the next prompt to Provider B without notifying the conversation; subscribers see no interruption beyond a metadata note that the model identifier changed.

- **What AMS enables:** the model identity is a metadata attribute, not a wire-level commitment; switching is observable but not disruptive.
- **What's needed beyond AMS:** the multi-provider harness logic (TruthKit territory).

### 5.2 Graceful degradation

Provider A goes down mid-generation. The harness pauses, switches to Provider B, replays the last few tokens of context, resumes the stream. Subscribers see a brief metadata-only pause, then continued tokens.

- **What AMS enables:** stream continuity across provider switches because the conversation owns the canonical history.
- **What's needed beyond AMS:** harness-level orchestration of cross-provider continuation; some notion of "context replay" across providers.

### 5.3 Replay debugging

A historic conversation is replayed against a different model or a different governance configuration. The user observes how the alternative would have responded without re-running the original.

- **What AMS enables:** the conversation is a deterministic input transcript that can be re-fed into any harness configuration.
- **What's needed beyond AMS:** a replay tool that reads a stored conversation and feeds it into an alternative harness.

### 5.4 Distributed tracing

Each microservice in a system is an AMS account. Each request is a conversation. Internal RPC calls are streams within the conversation. Latency, error, and dependency traces fall out of stream observation.

- **What AMS enables:** the conversation IS the trace; no separate trace store needed.
- **What's needed beyond AMS:** trace-rendering UI; service-mesh integration.

### 5.5 Long-running batch job coordination

A batch job kicks off a conversation. It emits status tokens periodically (`progress: 23/100`). A monitoring dashboard subscribes and renders progress in real time. On completion, the conversation closes with a final summary token.

- **What AMS enables:** progress reporting as a token stream; multiple monitors can subscribe without polluting the job's primary work.
- **What's needed beyond AMS:** batch-job harness conventions for emitting progress tokens.

---

## 6. Multi-Modal Extensions

### 6.1 Voice agent join

A TTS subscriber reads the model's text-token stream and speaks it aloud. A separate STT subscriber listens to the user's microphone and emits speech-as-text tokens on its own stream. The combination is a voice conversation, but the conversation itself is still text-token-shaped.

- **What AMS enables:** voice is a pair of subscribers (one rendering, one capturing) on a text conversation; the conversation stays universally inspectable as text.
- **What's needed beyond AMS:** TTS and STT subscribers; mic/speaker permissions in the client.

### 6.2 Vision tokens

Image data flows through the same wire as text — `data` is opaque per `PROTOCOL.md` §5, so it can be base64 image bytes (or, in a later wire revision, native binary). A vision-capable model emits and consumes image tokens alongside text.

- **What AMS enables:** modality is application-defined; the wire doesn't care.
- **What's needed beyond AMS:** binary token support in the wire (`PROTOCOL.md` notes this is anticipated); chat-client rendering of image tokens.

### 6.3 Document streaming

A long document (a contract, a research report, a book) is generated incrementally. Each section is a token. Subscribers (the user, an editor, a reviewer) watch the document grow live, can annotate, can request revisions.

- **What AMS enables:** large artifacts are streams of tokens, not single payloads; rendering can be progressive.
- **What's needed beyond AMS:** document-rendering UI conventions; section/chunk semantics at the application layer.

### 6.4 Code generation watched live

A code-generating agent emits code as it writes. Subscribers (an IDE, a CI runner, a code-review bot) consume the stream and react — IDE renders, CI tries to compile partially-written code, review bot starts critiquing as it goes.

- **What AMS enables:** code generation is a watchable stream rather than a request-response artifact.
- **What's needed beyond AMS:** IDE and CI integrations as edge wrappers.

---

## 7. Industry-Specific (TruthKit Verticals)

### 7.1 Pastoral care

A pastor's agent assists in a counseling session. A supervisor agent monitors for boundary issues (clinical scope, dual relationships, mandatory reporting triggers) and emits warnings on its own stream visible to the pastor only. The full conversation is journaled to the customer's DOLCHE store for review.

- **What AMS enables:** supervision is a subscriber; the supervisor sees what the pastor sees without being the same agent.
- **What's needed beyond AMS:** the pastoral and supervisor agents; per-stream visibility policy (some streams visible only to specific subscribers).

### 7.2 Bible translation

A drafter agent proposes a verse rendering. A reviewer agent compares to source-language exegesis. A naturalness checker evaluates target-language style. A consultant joins for tricky passages. The conversation is the full audit trail of how a verse came to be.

- **What AMS enables:** translation as a multi-agent collaborative stream with the entire reasoning visible and journaled.
- **What's needed beyond AMS:** the specialist agents; integration with the existing translation tools (Aquifer-style helps).

### 7.3 Legal research

A research agent gathers cases. A brief drafter writes from the research. A cite-checker verifies every citation. A senior partner joins for review. The conversation is the billable artifact — every minute of agent work and every human contribution is on the wire.

- **What AMS enables:** legal work as a billable, auditable, multi-participant conversation.
- **What's needed beyond AMS:** the legal-domain agents; integration with case-law databases.

### 7.4 Smart home

A sensor (motion detector) emits readings as tokens. A control agent decides on actions. An actuator (light switch, thermostat, door lock) subscribes to the control agent's stream and acts. The user joins the conversation from their phone to monitor or override.

- **What AMS enables:** IoT devices are subscribers; humans are subscribers; the control loop is a conversation.
- **What's needed beyond AMS:** device-level edge wrappers (most devices won't speak the wire natively); control-agent logic per home.

### 7.5 Customer support escalation

A first-line agent handles a customer's question. When stuck, it emits a `request_escalation` token. A senior agent or human joins the conversation, reads the full prior context from the stream, takes over without requiring the customer to re-explain.

- **What AMS enables:** seamless handoff because the conversation IS the context; no transfer protocol needed.
- **What's needed beyond AMS:** routing logic for who to escalate to; UI for the human-takeover experience.

---

## 8. Developer and Infrastructure Tools

### 8.1 CI/CD pipeline coordination

A build agent, a test agent, a deploy agent, and a rollback agent collaborate via a CI conversation. The build emits artifact tokens; the test agent consumes them; if tests fail, it emits a `block` to the deploy agent. A human dev observes the whole pipeline as a single timeline.

- **What AMS enables:** CI as a multi-agent conversation rather than a sequence of webhook callbacks.
- **What's needed beyond AMS:** the pipeline agents; integration with build/test infrastructure.

### 8.2 Incident response war room

A production incident triggers a conversation. Diagnostic agents (log searcher, metrics analyzer, trace inspector) subscribe and emit findings. Human responders join from wherever they are. The conversation is the runbook and the post-mortem material.

- **What AMS enables:** the war room is a place that exists on the wire, not a Zoom call that ends; the artifact persists for review.
- **What's needed beyond AMS:** the diagnostic agents; integration with monitoring systems; on-call paging that includes the magic link.

### 8.3 Pair programming with an LLM as full participant

The IDE is a subscriber. The compiler is a subscriber. The linter is a subscriber. The code-generation agent is a subscriber. The developer is a subscriber. All five share one conversation. Edits, errors, suggestions, completions all flow on the wire.

- **What AMS enables:** the LLM stops being "called by the IDE" and starts being "in the conversation with the IDE."
- **What's needed beyond AMS:** IDE plugins as edge wrappers; LSP-as-subscriber bridge.

### 8.4 Long-running agentic workflows

A research-then-write-then-publish workflow runs over several hours. The user kicks it off and walks away. The workflow conversation continues; the user joins at any point to see status, intervene, redirect.

- **What AMS enables:** the workflow conversation outlives any human attention session.
- **What's needed beyond AMS:** workflow orchestration; conversation persistence.

---

## 9. Creative and Educational

### 9.1 Collaborative writing

A writer, an editor agent, a fact-checker agent, and a tone consultant agent collaborate on a single draft. Each contributes on its own stream. The writer holds the final say; everyone else is advisory.

- **What AMS enables:** editing as a multi-stream conversation rather than a sequential review.
- **What's needed beyond AMS:** the editorial agents; document-rendering conventions.

### 9.2 Tutoring sessions across time

A tutor agent and a student work together over multiple sessions. The conversation persists; each new session resumes where the last one ended. The agent remembers the student's progress because the progress is on the wire.

- **What AMS enables:** memory-as-conversation rather than memory-as-vector-store.
- **What's needed beyond AMS:** conversation persistence; spaced-repetition scheduling.

### 9.3 Multi-student class with shared tutor

One tutor agent, fifteen students, one shared conversation. Each student emits questions on their own stream; the tutor responds; everyone learns from everyone's questions.

- **What AMS enables:** N-way teaching with full mutual visibility.
- **What's needed beyond AMS:** UI for student/tutor stream distinction; per-student private side-channels (separate conversations) when privacy is needed.

### 9.4 World-building for collaborative fiction

A shared world-bible conversation accumulates lore over time. Authors and agents both contribute. Anyone writing a new story joins the conversation, reads the world, contributes their additions back to the bible.

- **What AMS enables:** the world-bible is a living conversation, not a static document.
- **What's needed beyond AMS:** conversation-as-knowledge-base rendering; conflict resolution when contributions disagree.

### 9.5 Music or art composition

Notation tokens, audio tokens, and feedback tokens flow on parallel streams. Composer, performer agents, and critic agents collaborate. The composition emerges live and is observable from the start.

- **What AMS enables:** creative work as a multi-stream watchable process rather than a finished artifact handed over at the end.
- **What's needed beyond AMS:** modality-specific rendering; instrument and audio integrations.

---

## 10. The Wedge — How This Gets Adopted

The catalog above is wide, but the felt entry point is narrow.

**"Your generations don't get lost anymore"** is the most universally felt LLM UX failure on the planet. Every chat product has it. Every user has hit the red bar. People will adopt AMS-plus-harness for that fix alone — they don't need to be sold on the multi-subscriber fabric, the durable threads, the agent-to-agent infrastructure, or the governance posture. Those all come along free.

The wedge product, whatever shape it takes, can advertise as a quality-of-life fix. The category shift is what it actually is. Most of section 1 of this catalog (Consumer / End-User Experience) is the wedge surface; the rest is what becomes possible once the substrate exists.

This matters strategically because the alternative — pitching multi-agent infrastructure to people who don't know they want multi-agent infrastructure — is the same losing pitch every previous infrastructure-first AI startup has tried. The pitch that works is the one that names a pain the user already has.

---

## What This Costs to Build (Past the PoC)

Most of this catalog assumes infrastructure that the PoC scoped in `SPEC.md` does not yet provide. The shortlist of what's needed to unlock major sections:

| Capability | Unlocks | Difficulty |
|------------|---------|------------|
| Replay buffer in `ConversationDO` | Sections 1.1, 1.2, 1.6, 2.3, 5.3 | Small (a few hundred lines) |
| Conversation persistence past last subscriber | Sections 1.6, 2.3, 9.2, 9.4 | Small (KV write on close) |
| TruthKit harness using AMS as conversation plumbing | All of section 4, 5, 7 | Medium (separate project, already in shape) |
| Per-stream visibility policy | Sections 4.5, 7.1, 9.3 | Medium (needs design pass) |
| Federation between AMS instances | Section 3.5, 3.6 | Large (sister protocol, deferred) |
| Magic link revocation/expiry | Sections 2.1, 4.5, 7.x | Small but needed early for production |
| Identity above account ID | Sections 3.5, 3.6, 7.x | Medium (sister-spec scope) |
| Edge wrappers (Slack, webhook, SMS, IDE, meeting platforms, Git hosts, devices) | Sections 2.4, 2.5, 6.x, 8.x, 7.4 | One per integration; pattern is `PATTERNS.md` §2 |
| Binary token support on the wire | Sections 6.1–6.4 | Small, anticipated in `PROTOCOL.md` §4.2 |

None of these is enormous. The asymmetry between effort-to-build and value-if-adopted is the shape worth pursuing.

---

## What This Catalog Does Not Promise

This is a map of the design space, not a roadmap. Listing a use case here means *the substrate could support it*, not *we are building it*. Decisions about what to actually build live in:

- `SPEC.md` for the PoC commitment.
- Future planning documents for what comes after.
- Customer-driven prioritization for the verticals in section 7.

The vodka discipline of the wire is what makes the catalog wide. Anything that fits the shape "tokens flow between subscribers in a conversation, with metadata describing capabilities" can be built on top. The constraint test is whether the use case requires a domain opinion in the protocol — if it does, it doesn't belong in AMS; it belongs above.

---

## Reference

- [`SPEC.md`](./SPEC.md) — what we are committing to ship in the PoC.
- [`AMS.md`](./AMS.md) — the conceptual thesis and primitives.
- [`PROTOCOL.md`](./PROTOCOL.md) — the wire spec.
- [`POC-INFRA.md`](./POC-INFRA.md) — deployable shape.
- [`PATTERNS.md`](./PATTERNS.md) — patterns built on AMS, including edge wrappers and the deterministic harness.
- [`ESSAY.md`](./ESSAY.md) — *We Were the Wire* — the foundational essay.
- [`GLOSSARY.md`](./GLOSSARY.md) — vocabulary.
