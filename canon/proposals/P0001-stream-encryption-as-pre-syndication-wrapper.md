---
uri: ams://canon/proposals/P0001-stream-encryption-as-pre-syndication-wrapper
title: "P0001 — Stream Encryption as a Pre-Syndication Wrapper Primitive (PROPOSED)"
audience: canon
exposure: nav
tier: 1
voice: neutral
stability: evolving
tags: ["ams", "canon", "proposal", "security", "encryption", "wrapper-primitive", "vodka-architecture", "zero-trust"]
epoch: E0008.4
date: 2026-05-04
derives_from: "ams://canon/decisions/D0001-tokens-not-messages (the wire unit that the encryption unit aligns with, preserving 1:1 cardinality); ams://canon/decisions/D0006-dream-house-wire-edge-wrappers (the wrapper boundary this primitive sits at); ams://canon/decisions/D0010-observability-via-subscriber-not-wire (the subscriber pattern the encryption layer uses on both producer and consumer sides); ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive (the buffer the encryption layer wraps without modifying); ams://canon/decisions/D0017-selective-subscription (the wire feature that composes unchanged under ciphertext); ams://canon/decisions/D0018-multi-stream-per-account-per-conversation (the swarm pattern that composes unchanged under ciphertext); ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying (the session-resume pattern that composes unchanged under ciphertext); ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate (the dial-tone-vs-application test this proposal must answer to be promoted); ams://canon/principles/security-as-subscriber-pattern (the existing security pattern doc which currently delegates peer-to-peer encryption to application-layer responsibility — this proposal asks whether to pull that responsibility back into the platform substrate); operator↔Claude planning conversation 2026-05-04 establishing pre-syndication placement, AES-256-GCM as v1 primitive, HPKE as documented asymmetric path, TLS and naked RSA as rejected alternatives, the 1:1 token-frame cardinality property, the clarification that tokens are arbitrary opaque entities (not LLM tokens specifically) so the cardinality property generalizes to any producer-defined token unit, and the upgrade of key rotation from operational concern to primitive-level mandatory property — driven by the patient-adversary and training-corpus exfiltration threat models, where without rotation a single key compromise retroactively unlocks the entire historical ciphertext corpus and any meaning that enters a future model's weights via that corpus cannot be revoked"
governs: "If promoted: where stream-content encryption lives in the AMS architecture (pre-syndication, on the producer side, with symmetric decryption on the consumer side); the v1 primitive shape (AES-256-GCM with stream-scoped symmetric keys; OOB key exchange); what the wire and the buffer can see (ciphertext only); whether AMS itself ships this as platform-level value-added service (the dial-tone case) or documents the pattern and leaves implementation to third-party VAS providers (the application-layer case)."
status: proposed
---

# P0001 — Stream Encryption as a Pre-Syndication Wrapper Primitive (PROPOSED)

> Encrypt each token frame at the producer's wrapper, before it reaches the wire. Broker, `StreamBufferDO`, and every subscriber see only ciphertext token frames of identical shape and identical count to the plaintext frames. Consumers that hold the OOB-exchanged key decrypt on receive. The wire stays opaque (it already is), the buffer stays opaque (it already is — to a different bytes pattern), and every existing wire-layer composition (selective subscription, multi-stream per account, cross-session resume) holds unchanged. The v1 symmetric primitive is AES-256-GCM with a stream-scoped key and **mandatory rotation** at the primitive level — not at the deployment-operations level — because the threat model includes a patient adversary collecting ciphertext for later decryption and, specifically, the training-corpus exfiltration variant where AMS streams become high-value training data for future models and key compromise retroactively unlocks the entire historical corpus. HPKE is the documented asymmetric path. The unresolved question is whether AMS itself ships this as a paid platform-level service or whether the pattern is documented and left to third-party VAS providers.

## Description

Today, AMS canon places end-to-end encryption between specific peers in the application layer: the security-as-subscriber pattern explicitly says "subscribers that need end-to-end encryption between specific peers implement it themselves at the application layer over their token streams." That delegation is honest about what the platform does, but it does not answer two further questions that the substrate-positioning work in `D0020` and the buffering work in `D0016` raise.

First, *where* should application-layer encryption sit relative to the other wrapper primitives? The technically correct answer (most secure, simplest composition, no observability degradation) is: at the producer's wrapper, before any subscriber — including the buffer — sees the frame. This is the pre-syndication position. It is technically correct because it puts every subscriber, including platform-shipped subscribers, fully outside the content trust loop.

Second, given that the position is fixed, who builds it? The default per `D0020` is "third party builds it; platform documents the pattern." But there is a credible case that without an account-gated zero-trust posture in the platform itself, the regulated and enterprise tiers cannot adopt the substrate, the third-party VAS ecosystem on top of those tiers does not form, and the platform forfeits the high-margin segment to a competitor that does ship platform-level encryption.

This proposal commits to the *position* (pre-syndication) and the *primitive* (AES-256-GCM stream-scoped symmetric, with HPKE documented as the asymmetric path) and asks the operator to resolve the *placement* — platform-shipped value-added service, or third-party VAS pattern only — by applying the `D0020` test.

## Outline

- The Layering — Pre-Syndication, Around the Buffer Pipeline
- Threat Model — Patient Adversary and Training-Corpus Exfiltration
- The Cardinality Property — 1:1 Token Frame to Ciphertext Frame
- v1 Symmetric Primitive — AES-256-GCM with Stream-Scoped Key
- Mandatory Rotation — Primitive-Level, Not Operational
- Asymmetric Path — HPKE
- Rejected Alternatives — TLS, Naked RSA, MLS-for-v1
- OOB Key Exchange Is Out of Scope
- Composition with Existing Canon
- The Open Question — Dial-Tone or Application
- What This Proposes
- What This Does Not Propose
- What Promotion Would Require
- See Also

---

## The Layering — Pre-Syndication, Around the Buffer Pipeline

The AMS data path has three logical points where encryption could plausibly happen:

1. **At the producer, before the producer's wrapper emits to the wire.** Pre-syndication. Every downstream party — wire, `StreamBufferDO`, subscribers — sees ciphertext only.
2. **At the wire itself, between the broker and each subscriber.** Transport-level. Already the case via `wss://` TLS; this layer protects the bytes in flight but not at the broker or buffer.
3. **At the consumer, after receiving from the wire.** Post-receive. Useful for application-side processing but does nothing to remove the broker from the trust loop.

The proposal commits to (1). Encrypted-at-rest in the buffer, encrypted-on-the-wire, encrypted-everywhere-the-broker-touches. The producer-side wrapper takes a plaintext token, encrypts it, and emits the ciphertext via `emit_token` per `PROTOCOL.md`. The frame on the wire carries ciphertext as its `data` payload. The Conversation DO broadcasts. The `StreamBufferDO` (per `D0016`) captures ciphertext frames into its ring. Consumers that hold the symmetric key decrypt on receive; consumers that don't hold the key see opaque token-shaped frames and may still observe metadata, frame counts, and timing — exactly the information the security-as-subscriber pattern already names as "what the wire reveals to anyone who joins."

The producer's wrapper and the consumer's wrapper are both standard wrapper-class instances per `D0006` and `PATTERNS.md` §2. They do not grow new wire features; they wrap the existing emit/receive boundary. The wire learns nothing about encryption.

## Threat Model — Patient Adversary and Training-Corpus Exfiltration

The encryption layer must be sized to the actual threats the substrate faces, not to a generic "encryption is good" intuition. Naming the adversaries explicitly makes the v1 primitive choices — particularly mandatory rotation — derive from the threat model rather than read as stylistic preferences.

**In scope — what the encryption layer defends against:**

1. **Curious operator / compromised broker.** The broker today holds plaintext in flight (Conversation DO broadcast loop) and at rest (StreamBufferDO ring per `D0016`). Pre-syndication encryption removes the broker from the content trust loop entirely; the broker holds ciphertext only. Any operator-level access to broker memory, buffer state, logs, or observability sinks reveals nothing about content.
2. **Patient adversary collecting ciphertext for later decryption.** An adversary with sustained read access to broker storage, observability sinks, network traces, or log archives accumulates ciphertext over time. If a single static key were used for the lifetime of the substrate, a single later key compromise would retroactively unlock the entire historical corpus. **This is the adversary that makes rotation mandatory rather than operational.**
3. **Training-corpus exfiltration.** A specific and severe variant of (2): AMS streams are exactly the kind of high-value signal that future model trainers want — agent reasoning, tool calls, multi-agent negotiation, sensitive workflow content. Once accumulated ciphertext becomes plaintext via key compromise, it can be fed into a training corpus, and **once that meaning enters a future model's weights it cannot be revoked or unlearned.** The damage is permanent and propagates with every derivative model. Rotation bounds the corpus that any single key compromise unlocks; without rotation, every byte ever sent is permanently at risk of entering some future model's latent space.
4. **Network observer.** Already addressed by `wss://` TLS at the transport. The encryption layer is defense in depth — even a compromised TLS layer (CA breach, downgrade, MITM) does not reveal payload.

**Out of scope — what the encryption layer does not defend against:**

- **Traffic analysis.** Frame counts, sizes, timing, and the (account, conversation, stream) tuple remain visible to any subscriber and to the broker. A determined observer reconstructs substantial structure from these signals. Padding, cover traffic, and mixing belong to a separate primitive at a higher layer; they are not in P0001.
- **Endpoint compromise of a key-holding peer.** If the producer or a key-holding consumer is itself compromised, no protocol fix helps — the attacker now has the key and is indistinguishable from a legitimate participant.
- **Consumer-wrapper compromise via shared runtime with the broker.** This is why consumer wrappers run client-side per `D0006` and not co-tenanted with the broker. A deployment that violates this guidance forfeits the property.
- **Quantum adversaries (long horizon).** AES-256-GCM has reasonable post-quantum security margin (Grover gives effective ~128-bit work factor against AES-256, still infeasible). HPKE deployments concerned with quantum may select X25519Kyber768 for KEM hedging. P0001 does not commit to a quantum-resistant baseline at v1.
- **Compromise of the OOB key-distribution channel.** The encryption layer is only as strong as the OOB channel that delivers keys. Operators choosing weak OOB mechanisms (e.g., distributing keys via the same provider that hosts the broker) defeat the property. The proposal names this as a deployment concern; it cannot fix it from inside the wire.

The patient-adversary and training-corpus threats are the load-bearing motivation for the next two design choices — preserved 1:1 cardinality, and mandatory rotation.

## The Cardinality Property — 1:1 Token Frame to Ciphertext Frame

A central correctness property of this proposal: **the encryption unit aligns with the wire-token unit fixed by `D0001`**. One plaintext token frame in produces exactly one ciphertext token frame out. The wire-frame count remains identical to the plaintext token-frame count.

A subtle but important clarification: AMS treats tokens as **arbitrary opaque entities**. The wire-token is whatever the producer chose to emit as one frame — it may be an LLM subword token, a single character, a JSON fragment, a binary chunk, or anything else the producer decided is one token. `D0001` fixes the *granularity* (the wire moves at token shape, not message shape) and the *opacity* (the broker MUST NOT inspect the payload per `PROTOCOL.md` §7); it does not fix what one token *means*. The encryption primitive's 1:1 cardinality therefore holds for any producer-defined token unit. Every metric that derives from frame counts — billing, observability, eviction accounting in `D0016`'s buffer, the existing token-count derivation pattern in canon — continues to operate without change regardless of what the producer chose to put in each frame.

This is non-trivial. A naïve encryption scheme that buffered N plaintext tokens and emitted them as one larger ciphertext blob would break the wire's token-shaped semantics, break selective subscription's per-frame routing, and break the buffer's per-token eviction. The 1:1 discipline is what makes encryption compose cleanly with the rest of the substrate. The v1 primitive choice is constrained accordingly, and the constraint generalizes: any future content-transformation primitive AMS documents (compression, redaction, signing, framing transformation) must preserve 1:1 frame cardinality or it forfeits clean composition with the existing wire-shape decisions.

The information the wire (and any non-key-holding subscriber) still sees, even with full pre-syndication encryption: who is talking, in which conversation, on which stream, when, how often, and how big each token is. Traffic analysis on these signals can reveal substantial structure. This proposal does not address traffic analysis — that is named in the threat model above as out of scope and belongs to a separate primitive at a higher layer. The proposal makes the wire payload-confidential; it does not make the conversation traffic-pattern-confidential.

## v1 Symmetric Primitive — AES-256-GCM with Stream-Scoped Key

The proposal's v1 primitive:

- **Algorithm**: AES-256-GCM (authenticated encryption with associated data; standard, fast, widely audited, native in browser SubtleCrypto and Workers Crypto).
- **Key scope**: one symmetric key per (stream, key-version). A stream is the unit of ownership per `D0009`; making the key scope match the ownership scope means key revocation collapses to "stop emitting on that stream." The (stream, key-version) tuple makes rotation explicit at the key-identity level.
- **Frame format on the wire**: `key_version || nonce || ciphertext || auth_tag` (1-byte key_version, 12-byte GCM nonce, ciphertext same length as plaintext, 16-byte auth tag). Wire `data` field carries this concatenation, base64-encoded for JSON transport. Total wire-frame size grows by **29 bytes plus base64 overhead per token**. The 1-byte key_version supports 256 active key versions per stream, which exceeds any practical rotation cadence; if real-world data ever requires more, the field can grow with a backwards-compatible scheme indicator.
- **Nonce discipline**: monotonic counter scoped to (stream, key_version). The counter resets to zero on each rotation. After `2^96 - 1` emissions under a single key_version a rotation is forced, but the practical limit is rotation policy (see "Mandatory Rotation" below), not nonce exhaustion.
- **Associated data (AAD)**: at minimum `stream_id || key_version`, included as AAD so a ciphertext frame cannot be replayed against a different stream or under a different key version. May extend to include conversation_id and a frame counter when the operator's threat model requires it.
- **Forward secrecy at the rotation boundary**: provided by the mandatory rotation policy (see next section). Each rotation produces a fresh independently-derived stream key; an adversary who compromises the key at version N learns nothing about traffic at versions N-1 or N+1. Per-frame forward secrecy (every frame independently sealed) requires a ratcheting scheme (Megolm, MLS) and remains a documented future primitive option.

The v1 primitive is deliberately the smallest competent shape that delivers payload confidentiality at the producer-pre-syndication layer with 1:1 frame cardinality and rotation-bounded forward secrecy. It does not foreclose Megolm or MLS being added later as alternative primitives selectable via wrapper configuration.

## Mandatory Rotation — Primitive-Level, Not Operational

Key rotation is **mandatory at the primitive level** in this proposal — not a deployment-time operational choice that the operator may skip. The reasoning derives directly from the threat model: the patient adversary and the training-corpus exfiltration variant are both defeated only when the corpus a single key compromise unlocks is bounded to that key's active window. A v1 primitive that allowed indefinite static-key operation would structurally fail this requirement, regardless of how the operator chose to deploy it. Rotation therefore lives in the primitive specification, not in deployment guidance.

**Rotation triggers (any one initiates a rotation):**

- **Time-based**: a default cadence of one hour per stream key, configurable downward (more frequent) but with a documented ceiling that cannot be raised. The default cadence balances OOB-channel load against compromise-window size; the ceiling exists because longer windows progressively defeat the property.
- **Volume-based**: a hard ceiling of N frames per key (suggested default: `10000` frames, well below the `2^96` GCM nonce limit but small enough to bound corpus exposure on high-throughput streams). The smaller of time and volume triggers wins.
- **Event-based**: explicit producer-initiated rotation on any operator policy event (compromise suspicion, audit boundary, regulatory checkpoint).

**Rotation mechanism:**

1. The producer derives or fetches a new stream key via the OOB channel (mechanism out of scope per "OOB Key Exchange Is Out of Scope" below).
2. The producer emits a `set_metadata` frame on the stream announcing the rotation: `{"key_rotation": {"to_version": N+1, "effective_at_frame": F}}`. This uses the existing stream-metadata primitive per `PROTOCOL.md` §4.4 — **no new wire feature, no new frame type.** This is the same pattern `D0016` used for buffer discontinuity announcements.
3. Consumers receive the announcement, fetch (or derive) the new key via the OOB channel, and prepare to decrypt under both versions briefly during the cutover window.
4. The producer continues emitting under key_version N until frame F-1, then switches to key_version N+1 at frame F. The `key_version` byte at the head of each frame disambiguates which key applies.
5. After the cutover completes and any in-flight frames under key_version N have been processed (bounded by the buffer's TTL), both producer and consumer destroy the retired key material.

**Buffer composition — encryption composes ON TOP of `D0016`, does NOT modify it:**

`D0016` specifies the StreamBufferDO with **exactly four properties** (per-stream sharding, TTL bound, size bound, both bounds enforced) and explicitly closes the primitive with "all other behavior is opaque." This proposal does not extend, amend, or modify `D0016`. The encryption layer composes on top of it without touching the primitive's shape.

The relationship between rotation cadence and buffer TTL is **configuration-level, not primitive-level**:

- **Recommended deployment**: configure rotation cadence ≤ buffer TTL. Frames whose keys retire have already been evicted by TTL. The buffer never holds frames whose keys have retired. `D0016`'s primitive shape is unchanged; "buffer-cannot-outlive-its-key" is achieved through configuration discipline, not through modifying the primitive.
- **Permitted but not recommended**: configure rotation cadence > buffer TTL. Frames with retired keys remain in the buffer until normal TTL/size eviction. Consumers reading those frames see decryption failures; the buffer itself remains pure (it does not know what keys are or whether they have retired). The "buffer cannot outlive its key" property degrades — but the degradation is a consumer-wrapper concern (decryption fails), not a buffer concern.

This composition discipline is the vodka answer: encryption is a wrapper-layer concern; buffering is a primitive concern; the two compose at the configuration layer without entangling at the primitive layer. The consumer wrapper is responsible for key custody, including knowing which keys have retired; the buffer is responsible for opaque byte storage with TTL+size eviction.

**Reversibility:**

The default rotation cadence is a **two-way door** (deployment configuration; can be tuned without canon revision). The mandatory-rotation property itself is a **one-way door** once P0001 promotes — removing the mandatory property would re-expose the substrate to the patient-adversary and training-corpus threats and would require an explicit superseding decision. Future primitives (Megolm, MLS) may layer additional forward-secrecy properties, but the floor of "mandatory rotation at the v1 primitive level" cannot be lowered after promotion.

**Operational-only rotation was considered and explicitly rejected.** The rejected alternative — leaving rotation as deployment guidance and shipping a v1 primitive that operates indefinitely under a static key — fails the threat model at the layer the threat model lives. The patient-adversary and training-corpus threats cannot be defended at the deployment layer alone, because deployments that opt out of rotation forfeit the property silently and the substrate-level guarantee evaporates. Mandatory at the primitive level is the only construction that gives downstream consumers a guarantee they can rely on without auditing every deployment's configuration.

**Operational cost named explicitly:**

Mandatory rotation puts non-trivial load on the OOB key-distribution channel. Each stream rotates at the configured cadence; multi-stream conversations rotate per-stream independently; high-throughput agents rotate frequently on the volume trigger. Deployments should size their OOB channel accordingly. This is the primary cost of the property, and it is real — but the alternative (no rotation, indefinite static keys) is not viable under the threat model.

## Asymmetric Path — HPKE

For one-shot or sealed-recipient cases (a producer wants to emit to a specific named consumer's public key without any prior OOB symmetric exchange), HPKE (RFC 9180) is the documented path:

- KEM: X25519 (or X25519Kyber768 for post-quantum hedging where deployment supports it).
- KDF: HKDF-SHA256.
- AEAD: ChaCha20-Poly1305 (or AES-256-GCM for hardware-AES-rich environments).

HPKE produces sealed envelopes — the recipient's public key is encapsulated in a per-message header, and only the recipient's private-key holder can decrypt. For the multi-recipient broadcast case (a stream readable by N consumers), HPKE is encapsulated once and the derived AEAD key is reused across the stream's frames, falling back to the symmetric AES-GCM shape above for the per-frame work.

HPKE is documented as the asymmetric path; it is not the v1 primitive. The decision to use HPKE versus pre-shared symmetric keys is a deployment choice the producer's wrapper exposes as configuration. The wire and the buffer don't care.

## Rejected Alternatives — TLS, Naked RSA, MLS-for-v1

**TLS at the wire**: already in place (`wss://`), and unsuitable as the encryption layer for this proposal. TLS is point-to-point. Each subscriber's connection has its own TLS session. The broker decrypts inbound, broadcasts plaintext within the Worker, and re-encrypts to each subscriber. The broker sees plaintext. This is the trust property the proposal exists to remove. Adding "another" TLS layer between specific peers does not solve it because peers do not have direct connections — every peer-to-peer path traverses the broker.

**Naked RSA per token**: rejected on three grounds. (i) Wrong altitude — RSA-OAEP at 2048 bits caps plaintext at ~190 bytes, and tokens routinely exceed this; chaining multiple RSA blocks per token breaks the 1:1 cardinality discipline. (ii) Performance — RSA-encrypt per token is orders of magnitude slower than AES-GCM and would dominate emit latency. (iii) Anachronism — modern messaging encryption uses RSA only as a key-encapsulation step inside hybrid schemes (which is what HPKE already does cleanly); naked RSA as a per-message primitive is not how 2026 messaging is built.

**MLS or Megolm as v1 primitive**: rejected for v1 only. Both are excellent for their use cases — MLS for IETF-standard group messaging with full forward secrecy and post-compromise security across membership changes, Megolm for lighter-weight group ratchets with per-emission forward secrecy. Both are heavier than AES-256-GCM-with-pre-shared-key for the two-agent and small-swarm cases that dominate v1. They are documented as future primitive options selectable via wrapper configuration once demand justifies the implementation cost.

## OOB Key Exchange Is Out of Scope

Where the symmetric stream key comes from is an **out-of-scope** concern for this proposal. The proposal commits to:

- The producer's wrapper holds the key when it emits.
- The consumer's wrapper holds the key when it decrypts.
- The wire, the buffer, and any non-key-holding subscriber never hold the key.
- Key acquisition happens out-of-band relative to the AMS wire — separate channel, separate trust path, not via any AMS endpoint.

The mechanism — operator-managed KMS, per-conversation Diffie-Hellman over a separate REST endpoint, capability-bearer-token-with-embedded-key, X3DH-style asynchronous handshake, or any other scheme — is the deployment's choice. The proposal is agnostic. A reference implementation MAY ship one such mechanism for ecosystem bootstrap, but the architectural commitment is "OOB, not via AMS." This keeps the wire's permanent non-goals list intact.

## Composition with Existing Canon

The proposal is designed so every existing decision composes unchanged:

- **`D0001` — tokens, not messages.** Wire unit unchanged. Encryption unit equals wire unit.
- **`D0006` — dream-house wire-edge wrappers.** The encryption layer is two wrapper-class instances (producer-side encryptor, consumer-side decryptor). Wrappers absorb runtime concerns; the wire stays unchanged.
- **`D0010` — observability via subscriber, not wire.** Observability subscribers without keys see opaque token-shaped frames and metadata; with keys, they see plaintext like any other authorized consumer. The pattern is unchanged; the visibility scope is what the deployment configures.
- **`D0016` — buffering as wrapper primitive.** The `StreamBufferDO` captures ciphertext frames identically to plaintext frames. TTL and size eviction operate on bytes, agnostic to content. Vodka discipline holds at the buffer layer exactly as it does at the wire layer.
- **`D0017` — selective subscription.** Filters by `stream_id`. Unchanged.
- **`D0018` — multi-stream per account per conversation.** Stream identity is `stream_id`. Unchanged. Each stream MAY have its own encryption key.
- **`D0019` — cross-session continuity.** Session DO re-keying is content-agnostic. The buffer view a re-attaching consumer sees is ciphertext; if the consumer holds the key, decryption proceeds normally.
- **`D0020` — substrate not application.** Unresolved. See next section.

## The Open Question — Dial-Tone or Application

The unresolved question this proposal asks the operator to answer:

**Does encryption-around-the-buffer-pipeline cross the `D0020` exception threshold for "foundational components without which the ecosystem cannot form"?**

Two coherent answers exist:

**(a) Application — third-party VAS pattern only.** The proposal is documented in `PATTERNS.md` as a wrapper-class shape that any third party can build. AMS does not ship the producer-side or consumer-side wrapper. The wire, the buffer, selective subscription, and multi-stream all support pre-syndication encryption naturally because they are content-agnostic. A third party builds the encryption wrappers, sells them via Stripe agent-commerce rails, and the ecosystem fills in the gap. This is the `D0020` default. The cost: the regulated and enterprise tiers must trust some third party for their encryption layer, and AMS forfeits any direct revenue from those tiers' security premium.

**(b) Dial-tone — platform-level value-added service.** AMS itself ships the producer-side and consumer-side wrapper as part of the canonical MCP edge wrapper, with the v1 AES-GCM primitive and a documented OOB key-exchange convention (most likely a separate `keys.ams.example` REST surface that is not the wire). Pricing: account-gated, tiered, alongside the buffering primitive in `D0016`. Platform-level encryption becomes one of the things AMS itself sells. The cost: AMS takes on key-management complexity (even if "OOB" in the trust sense) and the security-audit responsibility that comes with shipping the cryptography itself.

The case for (b) is the regulated-tier argument: enterprise and regulated-industry agents cannot adopt a substrate that doesn't have a credible first-party zero-trust story, and a third-party-only answer is read as "the platform doesn't take security seriously." The case for (a) is `D0020`'s discipline: every "AMS should ship it" temptation strengthens lock-in and crowds out ecosystem; the platform's value is the substrate, not the products on top.

The proposal does not pre-commit. The operator picks (a) or (b) at promotion time, and the resulting `D00xx` decision records the choice with reasoning.

## What This Proposes

If promoted, the resulting decision would commit:

- **Pre-syndication placement** as the canonical position for stream-content encryption in AMS.
- **AES-256-GCM with stream-scoped symmetric key** as the v1 primitive shape, with `key_version || nonce || ciphertext || auth_tag` as the on-wire frame format.
- **Mandatory rotation at the primitive level** — not at the deployment-operations level — with default triggers (one hour OR `10000` frames OR explicit producer event), the `set_metadata`-based announcement mechanism, and key-version-bounded buffer retention.
- **The named threat model** — curious operator / patient adversary / training-corpus exfiltration / network observer in scope; traffic analysis / endpoint compromise / OOB-channel compromise out of scope. Future canon must justify any change against this threat model.
- **HPKE (RFC 9180)** as the documented asymmetric path for sealed-recipient cases.
- **Tokens-as-arbitrary-entities discipline preserved.** The encryption unit is the wire-token unit; the wire-token is whatever the producer chose to emit per `D0001`'s opacity guarantee. The 1:1 cardinality property holds regardless of what the producer put in each frame.
- **1:1 frame cardinality** as a correctness property — every encryption primitive AMS documents must preserve this, and the property generalizes to any future content-transformation primitive.
- **OOB key exchange** as a permanent non-goal of the wire — keys never traverse AMS endpoints, including for rotation events.
- **The composition guarantees** with `D0001`, `D0006`, `D0010`, `D0016`, `D0017`, `D0018`, `D0019` — these are now first-class invariants future canon must preserve. **`D0016` is composed on, not extended.** The encryption layer sits at the producer- and consumer-wrapper layer; `D0016`'s exactly-four-property primitive shape is unchanged. Deployments configure rotation cadence ≤ buffer TTL to satisfy the "buffer cannot outlive its key" property at the configuration layer rather than the primitive layer.
- **Either (a) or (b)** for the dial-tone-vs-application placement, with reasoning recorded in the resulting decision.

## What This Does Not Propose

- **Per-frame forward secrecy.** The v1 rotation cadence (default one hour or `10000` frames) provides forward secrecy at the rotation boundary, not per-frame. Per-frame forward secrecy requires a ratcheting scheme (Megolm, MLS) and remains a documented future primitive option selectable via wrapper configuration.
- **Traffic-analysis resistance.** Padding, cover traffic, and mixing are out of scope. The wire still reveals who-talks-to-whom-when.
- **Key custody by AMS.** Even under placement (b), AMS does not custody keys; it ships the encryption primitive and a convention for OOB key acquisition. Custody stays with the deployment.
- **A specific OOB key-exchange mechanism.** The proposal is mechanism-agnostic. A reference implementation may ship one, but the architectural commitment is "OOB, not via AMS."
- **Changes to the wire protocol.** No new frame types, no new fields, no new headers. The wire `data` field carries ciphertext under encryption exactly as it carries plaintext today.
- **A position on agent-identity verification.** Encryption protects payload confidentiality. It does not establish that the entity holding the key is the entity it claims to be. Identity is a separate concern (see security-as-subscriber pattern's signing sub-pattern).

## What Promotion Would Require

To promote this proposal to active canon (renumber to `DNNNN`, move to `canon/decisions/`, mark `status: active`), the following must be in place:

1. **Operator answers the open question.** A clear statement of whether placement (a) or (b) is selected, and why, must be recorded in the resulting decision's text.
2. **Threat model is confirmed or refined.** P0001 names the threat model explicitly (curious operator / patient adversary / training-corpus exfiltration / network observer in scope; traffic analysis / endpoint compromise / OOB-channel compromise out of scope). The promotion decision must either ratify this threat model unchanged or refine it with reasoning. The threat model determines whether the v1 primitive (AES-256-GCM with mandatory rotation) is sufficient or whether a stronger primitive (Megolm or MLS) needs to ship alongside.
3. **The security-as-subscriber pattern is updated.** That doc currently delegates peer encryption to "application layer." If this proposal promotes, that delegation language is updated to reference the new decision and to describe how the wrapper layer composes with the existing security-subscriber sub-patterns (signing, audit, policy, anomaly_detection).
4. **`PATTERNS.md` gains a new section.** The producer-side and consumer-side encryption wrapper pattern is documented as a sibling to `§2` (general wrapper pattern) and `§3` (archive subscriber). Includes the AES-GCM frame format, the AAD convention, and the OOB-key-exchange architectural commitment.
5. **If placement (b) is selected**, `D0016` and `D0020`'s "what AMS sells" lists are updated to include the encryption primitive, and `POC-INFRA.md` gains a section on the producer-side and consumer-side wrapper implementations.
6. **A reference key-exchange convention is documented.** Even if the v1 primitive itself does not commit to a specific OOB mechanism, the decision must point to at least one worked example so deployers have a starting shape.

The proposal does not require code to land before promotion — promotion is the canon-level act. Implementation follows in subsequent build slices per the PoC build repeatability pattern.

## See Also

- `ams://canon/decisions/D0001-tokens-not-messages` — the wire unit that the encryption unit aligns with
- `ams://canon/decisions/D0006-dream-house-wire-edge-wrappers` — the wrapper boundary this primitive sits at
- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the subscriber pattern the encryption layer uses on both producer and consumer sides
- `ams://canon/decisions/D0016-buffering-and-persistence-as-wrapper-primitive` — the buffer the encryption layer wraps without modifying
- `ams://canon/decisions/D0017-selective-subscription` — composes unchanged under ciphertext
- `ams://canon/decisions/D0018-multi-stream-per-account-per-conversation` — composes unchanged under ciphertext
- `ams://canon/decisions/D0019-cross-session-continuity-via-account-conversation-keying` — composes unchanged under ciphertext
- `ams://canon/decisions/D0020-agents-as-customer-and-third-party-vas-substrate` — the test this proposal must answer to be promoted
- `ams://canon/principles/security-as-subscriber-pattern` — the existing pattern doc that delegates peer encryption to application layer; this proposal asks whether to bring that responsibility into the platform
- `ams://docs/proposals-governance` — the proposals track this proposal is opened under
- `RFC 9180` — HPKE (Hybrid Public Key Encryption)
- `RFC 9420` — MLS (Messaging Layer Security), documented as deferred future primitive
