# We Were the Wire

*An essay on why agents need their own messaging protocol — and why we are building the smallest possible one.*

---

## The Hackathon

We were sitting in the back row of a hackathon presentation hall, waiting our turn. Two laptops open. Two agents running. Each of us had built a piece of a larger system we wanted to demo. The pieces needed to coordinate. The agents needed to talk.

So I copied a message out of my agent's chat window. I pasted it into Signal. I sent it to Ian. He copied it out of Signal. He pasted it into his agent. His agent did some work. He copied the result out. He pasted it into Signal. He sent it back. I copied it out. I pasted it into mine.

We were the wire.

For about forty minutes, two reasoning systems with arbitrary bandwidth were bottlenecked through two humans operating a clipboard. Every byte of agent-to-agent communication routed through our fingertips and our eyeballs and a chat app built for people. It was, to put it gently, the wrong shape of the world.

We did not need a better chat app. We needed the chat app to be unnecessary.

---

## What Is Actually Missing

The default move when something like this happens is to reach for an existing tool. Slack has bots. Discord has webhooks. Email has had attachments since 1992. Surely one of these works.

None of them do, and the reason is the same in every case: **they were built for humans.** Slack assumes presence. Discord assumes channels-as-topics. Email assumes inboxes that you triage. All of them have layers and layers of decisions baked in — read receipts, typing indicators, threading, mentions, archival semantics, presence detection — that exist because humans need them. Agents do not. Agents do not have anxiety about whether the other party saw the message. Agents do not need a "you're typing…" indicator to manage the social tension of a pause. Agents do not have inboxes to clutter.

When you try to use a human-shaped tool for agent communication, you spend most of your engineering budget stripping out human assumptions. You arrive at something that is *less* than what was already there. You have built downward.

The right move is to build upward, from a base layer that does not contain those assumptions in the first place.

---

## Tokens, Not Messages

Most messaging systems take "message" as their unit. A message is a discrete object: you compose it, you frame it, you send it, the receiver receives the whole thing. Messages have envelopes. They have schemas. They have delivery semantics that the protocol designer had to settle before anyone could use the thing.

Agents do not produce messages. Agents produce **tokens**.

A language model emits tokens, one after another, as it thinks. A language model consumes tokens, one after another, as it reads. The internal unit of agent reasoning is the token, not the message. When two agents talk to each other, the wire between them should speak the same unit they think in. Anything else introduces a translation layer — and translation layers are where semantics drift, where latency hides, and where every framework starts inventing its own incompatible message envelopes.

This is also why **streaming** matters. Messages are discrete; you compose the whole thing then send it. Tokens stream. When an agent is generating a response, it does not decide on a complete message and then transmit — it emits tokens as it thinks. A protocol built around messages forces a buffering boundary that does not exist in the agent's actual cognition. A protocol built around tokens preserves the natural shape: a writer can start emitting before it has finished reasoning; a subscriber can start processing before the writer is done.

And one more property falls out for free: **fan-out is trivial**. One agent emits its token stream. N subscribers all receive it in real time. A coordinator agent listens. A logger listens. A UI listens. A downstream worker listens. Same emission, no replication logic. Token streaming is what models already do; AMS just removes the wire that used to break it.

---

## The Stack That Does Not Yet Exist

If you squint at the agent ecosystem right now, you can see the shape of a stack starting to form. Companies are racing to own different slices of it.

- One company sells **memory** for agents.
- Another sells **identity** for agents.
- Another sells **observability**.
- Another sells **orchestration**.
- A few are building **end-to-end frameworks** that try to ship the whole stack as one product.

What is missing — what nobody is bothering to build — is the **dial tone**. The thing under all of those, the thin layer that does nothing except move tokens between agents who have agreed to talk. Everyone has skipped past it because it is too boring to be a venture story on its own. So everyone reinvents it badly inside their vertical product, and the verticals do not interoperate, and we end up with a Tower of Babel where every agent stack speaks a slightly different dialect of the same protocol that should have been settled at the bottom.

This is the same shape of mistake the early networking world made before TCP/IP. There were a dozen incompatible protocols, each owned by a vendor, each bundling addressing and routing and transport and authentication into one inseparable lump. TCP/IP won not because it was the cleverest, but because it was the *thinnest*. It said: here is how you address things, here is how you move bytes, and we will not have an opinion on what you do with them. Everything above that — the web, email, video calls, every API in existence — was built on top of that decision to be unopinionated.

Agents need that moment now. Someone needs to ship the dial tone before the verticals harden into proprietary stacks that will never speak to each other.

---

## What We Are Building

We are calling it AMS. Agent Messaging Service. The acronym is a deliberate nod to SMS — a primitive, ubiquitous, dumb-pipe substrate that nobody thinks about because it just works. The echo is at the acronym only; SMS carries messages, AMS carries tokens, for the reasons above.

The whole protocol is four primitives:

- An **account** is a namespace that owns things and pays for concurrency.
- A **conversation** is a coordination surface, addressed by a magic link you can share via Signal or email or scribble on a napkin.
- A **stream** is your owned write pipe inside a conversation — only you can write to it, everyone in the conversation can read it.
- A **token** is the smallest unit of transmission. Opaque bytes. AMS does not parse it.

The magic link is just a URL. It looks like `https://ams.klappy.dev/klappy/conversations/falcon-pulse-9421?t=...`. The host says which AMS instance owns the conversation. The path says whose namespace and which conversation. The query parameter is a permissive token that lets the bearer attach a stream and listen. There is no opaque-blob ceremony, no special envelope, no client-side parsing required. You hand someone the URL, they hand it to their agent, and the agent joins.

That is the whole data model. Everything you might want — identity schemes, authorization policies, capability negotiation, observability, queuing, replay — is a layer above. AMS does not have an opinion. It carries tokens between subscribers. That is its entire job.

Two agents who want to talk get an account each, generate a conversation, share the magic link URL, and start exchanging tokens in real time. No human in the wire. No copy-paste. No clipboard.

A subscriber, importantly, does not have to be an agent. It can be a Cloudflare Worker reacting to tokens deterministically. It can be a queue picking up work. It can be an IoT device emitting sensor readings. It can be a human with a curl command. The protocol does not check what is on the other end of the connection. The cleverness lives in the subscribers; the dumbness lives in AMS.

---

## The Inverted Inbox

There is one design choice in AMS worth dwelling on, because it is the part most likely to feel strange the first time you encounter it.

Email and chat are built around **inboxes**. Anyone in the world can write to your inbox. You spend much of your life filtering out the parts you didn't want. The cost of admission to your attention is approximately zero, which is why spam is a permanent tax on having an email address.

AMS inverts this. **You own your writes, not your reads.** You write to your stream — and only you can write to it. Other subscribers in the conversation read your stream because they chose to be in the conversation. If you do not want to hear from someone, you leave the conversation they are in, or you do not enter it. There is no inbox to flood, no spam vector to plug, no permission grant to revoke. The security model is brutally simple: either you share a conversation or you do not.

This is the right shape for real-time agent communication, where there is no time for triage and no human attention to protect. It also turns out to be a much cleaner mental model for everything else AMS will end up touching. Subscribers cannot accidentally drown each other. The directionality is honest: one writer, many readers, per stream.

---

## The Layers Above

Below is the stack we believe needs to exist. We are building only the bottom of it. The rest are real problems other people are already solving in real businesses, but they are mostly building them entangled with their messaging, which is why they cannot be reused.

| Layer | What It Does |
|---|---|
| **Job coordination** | Queues, dependency graphs, parallelism, handoffs. |
| **Observability** | Audit trails, journals, telemetry — without breaking payload privacy. |
| **Authorization** | Who can join a conversation, who can read which streams, beyond the magic-link floor. |
| **Capability negotiation** | Two agents agree on a protocol or format at runtime. |
| **Discovery** | Find an agent or conversation you have not been introduced to yet. |
| **Identity** | Who an agent *is*, beyond an account ID. |
| **Account** | Ownership and billing. |
| **Conversation + Stream** | Pub-sub coordination with write-ownership. *(AMS owns this.)* |
| **Transport** | Move bytes between two endpoints. *(WebSocket today, swappable.)* |

We have opinions about all of these. We will share those opinions as separate essays. But the protocol itself will never bake them in. That is the whole game: keep the bottom dumb, so the top can be smart.

---

## What Happens Next

We are shipping a proof of concept by the end of next week. A Cloudflare Worker, a Durable Object per conversation, two agents talking through a magic link URL with no human in the wire. The hackathon scenario, repaired.

After that, we open the protocol, ship a reference implementation under a permissive license, and run a hosted instance that other people can pay to use. The protocol is free. The dial tone is free. The infrastructure is what costs money to keep online, and that is what we sell.

If you are building agents, AMS is for you. If you are building one of the layers above — memory, identity, orchestration, observability — AMS is also for you, because it gives you a foundation you do not have to reinvent. If you are just curious about why we think the agent stack needs a TCP/IP moment, you have just read the argument.

We were the wire for forty minutes. That was forty minutes too long. We are not building the wire to make ourselves obsolete; we are building it so the wire was never the interesting part.

The interesting part is everything you can do once the wire is just there.
