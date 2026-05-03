---
uri: ams://canon/principles/security-as-subscriber-pattern
title: "Security as Subscriber Pattern — Signing, Audit, Policy, and Anomaly Detection Live in Subscribers, Not in the Wire"
audience: canon
exposure: nav
tier: 2
voice: neutral
stability: semi_stable
tags: ["ams", "canon", "principle", "security", "subscriber-pattern", "polymorphic", "signing", "audit", "policy", "anomaly-detection", "non-goals"]
epoch: E0008.4
date: 2026-05-02
derives_from: "AMS.md §3 (polymorphic subscribers), AMS.md §11 (positioning), ams://canon/principles/operator-as-subscriber, ams://canon/principles/observability-as-subscriber, ams://canon/decisions/D0010-observability-via-subscriber-not-wire, ams://canon/constraints/permanent-non-goals"
complements: "ams://canon/principles/observability-as-subscriber, ams://canon/principles/operator-as-subscriber, ams://canon/constraints/observability-payload-boundary, ams://canon/constraints/wrapper-stays-cheap"
governs: "How security functions — signing, audit, policy enforcement, anomaly detection — participate in AMS conversations. The principle is the same as D0010's for observability: security is a subscriber pattern, not a wire feature. Recommended convention; security subscribers may operate under any role they declare."
status: active
---

# Security as Subscriber Pattern — Signing, Audit, Policy, and Anomaly Detection Live in Subscribers, Not in the Wire

> Security functions for an AMS conversation — signing of emissions, audit of activity, policy enforcement against harmful content, anomaly detection on behavioral patterns — join the conversation as polymorphic subscribers with declared roles, the same way operators and observability sinks do. The wire structurally cannot enforce security decisions, and that is the property that lets every kind of security live above it.

## Description

D0010 (`ams://canon/decisions/D0010-observability-via-subscriber-not-wire`) made observability a subscriber pattern rather than a wire feature. This principle generalizes the same architectural choice to the security class: signing, audit, policy enforcement, and anomaly detection are each a recognized subscriber role with declared metadata, not a capability the wire validates or enforces.

The pattern composes naturally with the existing subscriber model. A conversation may have zero security subscribers, one, or many. Each one declares its role in stream metadata so peers can adapt. None of them gates the wire — security subscribers cannot block tokens, cannot mediate emissions, and cannot prevent other subscribers from joining or leaving. What they can do is observe, sign, attest, alert, and (by convention) request termination. The bounded power is the feature, not the limitation.

This principle is convention. Security subscribers may operate under different conventions if they declare them. The convention here is the recommended default for the v1 use case and the foundation for any subsequent threat-model work the project takes on (per the open observation in `journal/2026-05-02-ams-per-conversation-runtime-isolation-idea.tsv`).

## Outline

- The Pattern: Security as a Class of Subscriber Roles
- The Four Sub-Patterns Within the Class
- Why Security Belongs Above the Wire
- The Bounded Power of Security Subscribers
- The Security Subscriber's Capabilities Declaration
- Failure Modes the Pattern Prevents
- What This Is Not

---

## The Pattern: Security as a Class of Subscriber Roles

A security subscriber is a polymorphic subscriber that declares one of the recognized security roles in its stream metadata. The wire treats it identically to any other subscriber — it owns a stream, subscribes to peer streams, and emits or stays silent according to its declared posture. The "security" property is entirely in the role declaration and in how peers and operators choose to act on what the subscriber emits.

The class includes four recognized sub-patterns documented below. Each sub-pattern is the application of the polymorphic-subscriber model to one specific security function. The four are not exhaustive; new security roles can be added by declaration without changing the wire. The class is a recommended naming convention so well-behaved subscribers interop without surprises.

## The Four Sub-Patterns Within the Class

### Signing as Subscriber

A signing subscriber receives the broadcast, computes signatures over peer streams (or its own previous emissions), and emits signature tokens on its own stream. Peers that need to verify can subscribe to the signer's stream and validate against the signer's published key. Signature schemes (Ed25519, ECDSA, post-quantum candidates) are the subscriber's choice; the wire takes no opinion.

The signing subscriber does not sign on behalf of other subscribers. A subscriber that wants its own emissions signed signs them itself before emitting (`ams://canon/constraints/permanent-non-goals` item 1 keeps signing schemes above the wire). The pattern documented here is third-party attestation — the signer attests that it observed certain tokens flow on certain streams at certain times, not that it speaks for the original emitter.

### Audit as Subscriber

An audit subscriber is a structural extension of the observability sink (`ams://canon/principles/observability-as-subscriber`). The difference is the persistence guarantee: an audit subscriber writes to immutable, append-only storage with timestamps and (typically) cryptographic chaining for tamper-evidence. Observability sinks may discard, sample, or aggregate; audit sinks do not.

The audit subscriber inherits the observability subscriber's payload-boundary constraint (`ams://canon/constraints/observability-payload-boundary`) by default and may declare a stricter or looser policy if the operator's compliance posture requires it. The boundary is declared in metadata; the wire does not enforce it.

### Policy Enforcement as Subscriber

A policy subscriber watches the broadcast for content or behavioral patterns that violate a declared policy and emits warning, alert, or termination-request tokens on its own stream. Per the moderator role in `ams://canon/principles/operator-as-subscriber`, peers may by convention honor termination requests from subscribers declaring `posture: "moderator"`. The wire does not enforce the honoring; subscribers that ignore the moderator's signal remain conformant.

The "enforcement" name is a naming concession to common usage. Strictly, the subscriber requests; the conversation enforces by social convention. The wire is structurally incapable of enforcement at the data-plane level — a token already broadcast cannot be unbroadcast — and this is the property that keeps policy decisions reversible and contestable instead of irrevocable.

### Anomaly Detection as Subscriber

An anomaly-detection subscriber watches the broadcast for unusual patterns (token rate spikes, off-distribution content, suspicious metadata changes, subscriber join/leave anomalies) and emits alert tokens on its own stream. The detection model is the subscriber's choice; the alert format is application-defined and declared in metadata. The pattern is the inverse of the policy-enforcement pattern: policy fires on known-bad patterns; anomaly detection fires on unknown patterns deviating from baseline.

Anomaly detection is the most recently adopted of the four sub-patterns and the one with the least settled convention. The role is included here so future canon work has a named handle.

## Why Security Belongs Above the Wire

The architectural reasoning is the same as for observability (D0010), with three additions specific to the security class:

- **Pluralism.** Different operators have different threat models. A consumer-facing conversation needs different security subscribers than an enterprise-compliance conversation than a research conversation between adversarial agents. A wire that picked one security model would foreclose the others; the subscriber pattern lets each conversation pick what it needs.
- **Reversibility.** Wire-enforced security decisions are irrevocable. A token blocked at the wire is gone; a subscriber who is denied admission cannot petition for review. Subscriber-pattern security is reversible by definition — the subscriber can be ignored, removed, replaced, or overruled by the operator without changing the wire.
- **Verifiability.** Security claims have a debt obligation per the project's Axiom 2 ("A Claim Is a Debt"). A wire that claimed to enforce a security property would have to prove the enforcement under all paths through the wire — every implementation, every transport, every adapter. A subscriber that claims to enforce a security property has to prove only its own behavior. The verifiability surface is dramatically smaller.

These three forces compound the general non-goals discipline (`ams://canon/constraints/permanent-non-goals`). Security at the wire would commit AMS to opinions the project explicitly refuses to own and would create a verifiability obligation the project cannot honestly meet at the substrate altitude.

## The Bounded Power of Security Subscribers

The bounded-power property is what makes the pattern work. A security subscriber:

**Can:**

- Observe every token on every stream in the conversation it joins
- Compute signatures, hashes, and attestations over what it observes
- Persist what it observes to durable storage of its choice
- Emit tokens on its own stream — alerts, signatures, audit records, termination requests
- Declare its role and posture so peers know what to expect
- Be one of many security subscribers in a conversation (multiple signers, audit and policy together, anomaly detection alongside both)

**Cannot:**

- Block another subscriber's token from being broadcast
- Prevent another subscriber from joining the conversation
- Force termination of the conversation (it can request; convention decides)
- Read its own stream's emissions echoed back (D0009 applies uniformly; `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription`)
- Declare a wire-level role the protocol enforces — declarations are convention, peers may ignore

The asymmetry is deliberate. The subscriber pattern provides observability and the right to speak; it does not provide gatekeeping. Gatekeeping at the substrate would be wire-feature creep; gatekeeping at the application is the right altitude for it.

## The Security Subscriber's Capabilities Declaration

A security subscriber declares itself in stream metadata via the `capabilities` well-known key (`PROTOCOL.md` §4.4). The recommended schema:

```json
{
  "capabilities": {
    "ams.convention.v1": {
      "role": "security",
      "function": "signing" | "audit" | "policy" | "anomaly_detection",
      "posture": "passive" | "alerting" | "moderator",
      "scope": ["lifecycle", "structural", "content"],
      "attestation": {
        "scheme": "ed25519",
        "public_key_url": "https://signer.example.com/keys/2026-05-02"
      }
    },
    "annotations": {
      "display_name": "klappy Audit Sink",
      "operator": "ops@klappy.dev",
      "policy_url": "https://klappy.dev/security-policy",
      "compliance_frameworks": ["SOC2", "internal-only"]
    }
  }
}
```

Field meanings:

- **`role: "security"`** — class membership. Distinguishes from `operator`, `observability_sink`, and other subscriber roles.
- **`function`** — the specific sub-pattern: `signing`, `audit`, `policy`, or `anomaly_detection`. Future functions get added here as the convention evolves.
- **`posture`** — one of:
  - `passive` — observes only, does not emit
  - `alerting` — observes and emits alert tokens but takes no termination posture
  - `moderator` — observes, alerts, and may emit termination requests that peers may honor by the operator-as-subscriber convention
- **`scope`** — declares what the subscriber consumes, drawn from the same scope vocabulary as observability sinks (`lifecycle`, `structural`, `content`) plus the implicit `content` for security functions that need to read tokens.
- **`attestation`** — for `signing` function only; declares the signing scheme and the public-key location peers can verify against.
- **`policy_url`** — link to the operator's stated security policy, mirroring the observability convention.
- **`compliance_frameworks`** — informational tags so peers and auditors know what regulatory regimes the subscriber's behavior is shaped by.

The schema is intentionally extensible. Functions, postures, and attestation schemes can be added by declaration without protocol change. Peers that recognize an unknown value treat it as opaque metadata.

## Failure Modes the Pattern Prevents

- **Wire-feature creep into security.** Without the subscriber pattern, the natural drift is to add signing or moderation as wire features. Each such feature commits AMS to an opinion on what gets signed, who can moderate, and what enforcement means — opinions the non-goals list explicitly refuses (`ams://canon/constraints/permanent-non-goals` items 1, 3).
- **Security without verifiability.** Without bounded power, a security subscriber that claims to "enforce" something it cannot actually enforce becomes vibes-based marketing. The bounded-power property forces honest claims: the subscriber observes, attests, and requests; the conversation enforces by convention.
- **Single point of compromise.** A wire-level security feature becomes the attack target — break the wire, break security for every conversation. The subscriber pattern distributes the security surface across however many subscribers are joined; compromising one signer does not compromise the audit subscriber, the policy subscriber, or the conversation itself.
- **Forced security uniformity.** A wire-level security model would impose one threat-model assumption across every conversation. The subscriber pattern lets each conversation declare what it needs and lets multiple security subscribers compose without negotiation.
- **Unannounced enforcers.** Without the role declaration, peers cannot tell that a security subscriber is in the room. The declaration is convention, not enforcement, but it is the difference between an audit sink that is acknowledged and one that is hidden — and the audit value is much higher when participants know the audit is happening.
- **Conflation with observability.** Observability sinks discard or sample; audit sinks persist immutably. Without the function-name distinction in metadata, a subscriber that needs audit guarantees may end up subscribing to an observability sink and discovering the records are not retained. The naming convention makes the difference visible.

## What This Is Not

- Not a substitute for transport-level security. AMS uses TLS at the WebSocket transport (`wss://`); that remains unchanged. The subscriber-pattern security operates above the transport, not in place of it.
- Not a substitute for application-level cryptography. Subscribers that need end-to-end encryption between specific peers implement it themselves at the application layer over their token streams. The signing-as-subscriber pattern is third-party attestation, not E2E crypto for the participants.
- Not a list of required security subscribers. Every conversation chooses what security subscribers, if any, it needs. A consumer chat conversation may run with none; an enterprise compliance conversation may run with all four. The pattern documents how to participate, not when to.
- Not enforcement at the wire. Repeated for emphasis: the wire structurally cannot enforce security decisions. Tokens already broadcast cannot be unbroadcast; subscribers cannot be forcibly muted at the wire layer; the conversation cannot be terminated by a security subscriber alone (only by convention honored by other subscribers, or by the operator out-of-band per `ams://canon/principles/operator-as-subscriber` "What This Is Not").
- Not a complete threat model for AMS. The threat-model gap remains open per the per-conversation runtime isolation journal entry. This principle provides the structural pattern; the actual enumeration of threats and the per-threat coverage analysis is future work that needs its own planning round.
- Not specific to two-agent conversations. The pattern works for many-subscriber conversations of any composition.

## See Also

- `ams://canon/decisions/D0010-observability-via-subscriber-not-wire` — the architectural decision this principle generalizes to the security class
- `ams://canon/principles/observability-as-subscriber` — the direct sibling pattern; security and observability share the same polymorphic-subscriber base
- `ams://canon/principles/operator-as-subscriber` — the cousin pattern; the moderator role overlaps with security policy enforcement at the convention layer
- `ams://canon/decisions/D0009-stream-as-primitive-ownership-excludes-subscription` — the wire model that applies uniformly to security subscribers
- `ams://canon/constraints/permanent-non-goals` — items 1, 2, 3 cover the security-relevant layers AMS refuses to own
- `ams://canon/constraints/observability-payload-boundary` — the inherited safety contract for audit subscribers
- `ams://canon/constraints/wrapper-stays-cheap` — the related constraint that keeps security wrappers from drifting into security products
- `journal/2026-05-02-ams-per-conversation-runtime-isolation-idea.tsv` — the open threat-model gap this principle creates the structural foundation for addressing
- `klappy://canon/principles/dry-canon-says-it-once` — the reason this principle exists as one document covering four sub-patterns rather than four separate documents
