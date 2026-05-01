# Horizon — The Durable Thread

> Token stream routing.

A forward-looking essay. What AMS makes possible once it exists, and once it sits inside a TruthKit-shaped harness as the conversation plumbing for real agent and model interaction.

This is not the spec. The spec is [`SPEC.md`](./SPEC.md). This is the dream the spec is the first move toward.

---

## The Wrong Substrate

Open any chat interface for any model — Claude, ChatGPT, Cursor, Gemini, the rest — and you will eventually see the red bar. *Response incomplete.* Connection lost. Try again. The model was thinking; you watched it stream tokens for thirty seconds; then the stream stopped halfway through a sentence and the UI told you the conversation was broken. The model, of course, kept going. It produced its remaining tokens to no one. They went to the abyss. You sat there. You tried to decide whether to wait, retry, or accept the loss.

This failure is universal. Every chat product has it. It is not a bug in any one of them. It is a structural consequence of building consumer chat on the wrong substrate.

The substrate the industry chose looks like this: the **browser** holds the long-lived connection to the model. The browser is durable, the gateway is plumbing, the inference endpoint is plumbing. So when the browser hiccups — WiFi flicker, mobile backgrounding, a tab loses focus, an SSE timeout four hops upstream — the model keeps emitting tokens to a connection that no longer exists. The browser cannot tell the difference between "the model is still thinking" and "the model finished but I missed it." Neither can the user.

Every product papers over this with engineering: retry logic, partial-response recovery, "regenerate" buttons, optimistic SSE reconnection, server-side request resumption, idempotency keys, deduplication. Each is real engineering effort. None of it fixes the underlying shape. They are all attempts to simulate a durable thread on a substrate that does not provide one.

## The Inversion

AMS plus a harness gives you the durable thread directly.

The architectural shape inverts. The **harness** becomes the durable thing. The harness owns the conversation, owns the AMS stream the model emits to, owns the long-lived relationship with the model. The browser becomes a *re-attachable lens* — it subscribes to the conversation, reads the stream, and if it drops, it just reattaches. The model never knew the browser dropped because the model was never talking to the browser; it was talking to the harness, and the harness is still there. Tokens do not go to the abyss because they go to the AMS conversation, which is observable, replayable, and persistent.

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

That is the entire shift. Every consequence below falls out of it.

## What Falls Out

### Cross-device continuity

Start a long generation on the desktop. Close the laptop. The harness keeps reading the model's output. Tokens flow into the AMS conversation. Open the phone an hour later. The phone subscribes to the same conversation by its magic link, which lives in your account history. It catches up via replay, then streams live. No "incomplete" anywhere. Just a generation that continued without you and is happy to show you what happened.

The same shape works for: closing the lid, switching networks, walking out of WiFi range, putting the phone to sleep, the train going through a tunnel. None of these need to be a session-ending event. The session is not the connection.

### Generation as shared artifact

Send a magic link to a colleague: *"watch this thinking session with me."* They join the conversation, see the tokens that already arrived (replay), see new tokens as they come in (live). They can subscribe their own agent as another stream — a translator, a fact-checker, a notes-taker. They can leave a comment on their own stream that you see in real time without interrupting the model's output.

A generation stops being a private session and becomes a **place**. You can walk away from it. Come back. Bring others into it. Reference it. Link to it. The thread is the artifact, not the prompt or the response.

### Real-time epistemic governance

Another agent — call it a fact-checker, or a citation verifier, or a tone monitor — joins the conversation as a subscriber. It reads the model's stream as tokens arrive. When it sees a hallucination or an unsourced claim, it emits a correction on **its own stream**. The user sees both streams interleaved in their UI. The model is uninterrupted; the correction is alongside, not in the way.

This is exactly the TruthKit posture — *reinforcement, not enforcement* — made operationally cheap. Governance is a subscriber, not an interceptor. You add governance by adding a subscriber. You remove it by leaving the conversation. You change it by swapping the subscriber. The model and the user never have to know the governance composition; they just see what was emitted.

Stack two governance subscribers. Stack five. Run them in parallel. Compare them in real time. The architecture has nothing to say about how many — they are subscribers; that is all.

### Agent crash recovery

Klappy's agent emits a long task to Ian's agent. Ian's agent works on it for several minutes, then crashes mid-execution — process killed, container OOM, network blip on the inference endpoint, anything. In the old shape, the work is lost; the conversation is broken; you start over.

In this shape, a new instance of Ian's agent spawns, joins the same conversation by magic link, reads the stream from the cursor where the previous instance stopped emitting, and resumes. It knows what work has already been done because the work is on the stream. It knows what was promised because the prompt is on the stream. It picks up. The conversation does not notice the swap.

Spec-vs-instance from [`PATTERNS.md`](./PATTERNS.md) §1 becomes load-bearing in a way it currently is not. The spec is the durable identity (what the agent is). The instance is replaceable (which copy is acting). The conversation is the connective tissue between them — the place where state lives long enough for instances to come and go.

### Agent-as-team-member

An agent has an account. The account has a namespace. The agent joins your team's AMS-backed channels — or your team's Slack, if Slack runs as one of the edge wrappers from [`PATTERNS.md`](./PATTERNS.md) §2. The agent listens. It contributes when called on. It does not lose connection between meetings because it is not on a connection — it is a subscriber. It is in the room. It can be in many rooms.

The category — "chat platform" — collapses into "AMS conversation plus a UI." Slack-the-app, Discord-the-app, Teams-the-app, Signal-the-app: each becomes a renderer of conversations whose streams happen to be human-emitted (and increasingly, agent-emitted, with the same broadcast semantics).

### Multiplayer agent flows

Two humans, each with a personal agent, in one conversation. Four streams. Everyone sees everyone else's tokens. The humans talk to each other through their UIs; their agents collaborate on subtasks in parallel; everyone observes the collaboration. The humans can pull their agents back at any moment by sending a token; the agents can prompt the humans back by emitting on their own streams.

The interface for this is not new. It looks like a chat. It just happens to have more participants than chat-as-product currently allows for, and the participants happen to be a mix of carbon and silicon.

## The Wedge

The thing about all of this is that the felt pain — the entry point that gets ordinary users to adopt — is not "multi-agent infrastructure." Most users do not want multi-agent infrastructure. Most users do not know what multi-agent infrastructure is.

What they want is for the red bar to go away.

**"Your generations don't get lost anymore"** is the most universally felt LLM UX failure on the planet, across every product, every model, every interface. People will adopt for that fix alone. The multi-subscriber fabric comes along free. The cross-device continuity comes along free. The generation-as-shared-artifact comes along free. Once they have the substrate, the use cases discover themselves.

The wedge product does not have to advertise as a category shift. It can advertise as a quality-of-life fix. The category shift is what it actually is.

## Why This Combo, Specifically

AMS alone is the wire. A harness alone is governance with no carriage. Together:

- **TruthKit** owns the *what* — which model, what context, what governance, what validation, where the DOLCHE journal lives.
- **AMS** owns the *how* — who can subscribe, how tokens are delivered, what happens when consumers drop, how multiple subscribers compose.
- **The customer's git repo** owns the *durable record* — DOLCHE-encoded artifacts of what happened, in the customer's own infrastructure, portable away from us at any time.

Each layer owns one concern. None of the layers know about the others' internals. The harness can be swapped. The wire can be swapped. The journal can be swapped. The combination produces an inference experience that is governed, observable, resumable, multi-subscriber, multi-device, and durable — none of which any current consumer chat product offers.

The vodka discipline holds across all three layers. None of them are opinionated about the domain. The Bible-translation deployment, the legal-research deployment, the pastoral-care deployment, and the smart-home deployment all run on the same substrate. The flavor lives in the canon each customer bring to their TruthKit, not in any infrastructure layer.

## What This Costs to Build

The PoC scoped in [`SPEC.md`](./SPEC.md) is the entire substrate prerequisite. Everything in this essay assumes that the PoC has shipped — the Worker, two DO classes, the MCP wrap, the demo gate. Past the PoC, the additional work to unlock the durable-thread experience is:

- **Replay buffer** (deferred in `SPEC.md` §5): so a re-attaching subscriber catches up on what it missed.
- **Conversation persistence** (open question in [`AMS.md`](./AMS.md) §9): so a conversation outlives its last subscriber.
- **A harness that uses AMS as its conversation plumbing** (TruthKit work, not AMS work): the proxy that calls the model and emits tokens onto the AMS stream.
- **A reference chat UI** (a separate product, ~200 lines): a subscriber that reads a conversation and renders it. This is what an end user sees; it is not the load-bearing part.

None of these is large. The replay buffer is a few hundred lines in `ConversationDO`. Conversation persistence is a KV write on close-with-no-subscribers. The TruthKit harness already exists in concept and shape. The reference chat UI is the smallest piece because the substrate is doing the work.

The asymmetry between effort-to-build and value-if-adopted is exactly the shape worth pursuing.

## What Could Go Wrong

The honest list:

- **Replay-buffer cost.** Persisting tokens for late-joining subscribers is real storage and bandwidth. We will need cheap storage tiers and clear retention policy. The right answer is probably "buffer the last N tokens for free, configurable, with the journal sink being where long-term durability actually lives."
- **Privacy semantics around shared artifacts.** A magic link that lets a colleague *watch* a generation is also a magic link that, if leaked, lets anyone watch. Revocation, expiry, and per-stream visibility become real product surface. They were deferred in the PoC; they become first-tier in the chat-product layer above.
- **The "everyone sees everything" model needs nuance for human-facing rooms.** A multi-stream conversation in which a private agent's working notes are visible to all subscribers may not be what the user wants. The protocol does not have an opinion; the chat-UI layer above will need policy for which streams render where.
- **Adoption inertia.** Every existing chat product has six years of UX investment. A new substrate has to either be the foundation of a new product (probably) or persuade an existing product to swap its substrate (very hard). The wedge is real, but the climb is real too.
- **The model providers themselves may add resumption.** OpenAI or Anthropic could ship native conversation-resumption with stream-replay tomorrow. That would close the entry-point pain without solving the multi-subscriber category. It would still leave most of this essay's territory open, but it would weaken the wedge.

These are not reasons not to build. They are the things that get added to the journal as we hit them.

## What Stays True Across All of This

- The wire stays push-native, opaque, broadcast-faithful. The dream-house wire from [`PROTOCOL.md`](./PROTOCOL.md) does not change.
- Edge wrappers ([`PATTERNS.md`](./PATTERNS.md) §2) stay disposable. As MCP and other agent runtimes evolve to hold persistent connections natively, the wrappers retire. The wire does not.
- Governance is a subscriber posture, not an interceptor posture. TruthKit's *reinforcement, not enforcement* maps cleanly onto "governance lives on its own stream in the conversation."
- The customer's git repo holds the durable record of what happened. Not us. Not the model provider. The customer.

This is the architectural commitment underneath the dream. The fix to the red bar is the felt entry point. What it actually opens is a category of inference experience that does not currently exist.

We are building the foundation. The phones get built later. The dial tone is enough.

---

## Reference

- [`SPEC.md`](./SPEC.md) — what we are committing to ship in the PoC.
- [`AMS.md`](./AMS.md) — the conceptual thesis and primitives.
- [`PROTOCOL.md`](./PROTOCOL.md) — the wire spec.
- [`PATTERNS.md`](./PATTERNS.md) — the patterns this enables, including edge wrappers and the deterministic harness.
- [`ESSAY.md`](./ESSAY.md) — the foundational essay (*We Were the Wire*).
