# AMS / TinCan — Pricing, Positioning, IP, Strategy

**Strategic brief for Tim and Ian — 2026-05-06**
**Status: planning, no decisions taken. Input sought.**

---

## TL;DR

A market-research and cost-modeling pass on TinCan tiers turned into a coherent go-to-market strategy. The vodka architecture (D0006, D0020, D0026, wrapper-stays-cheap, doing-less-enables-more) produces 95%+ gross margins at every scale and creates three structurally-locked B2B verticals where incumbents are pinned by their own pricing or positioning. Combined with the solo-founder reality (one person who can train others, no current headcount, no appetite for VCs), the path becomes: **ship B2C consumer tiers first, distribute to ~$8–10K MRR over 6–8 months, fund the first B2B hire from accumulated MRR plus their first 2–3 enterprise contracts, then enterprise revenue funds subsequent hires.** S1 — niche-tool sustainable indie outcome at ~$3M ARR — is the path I'm planning against; anything bigger is upside that I'm not budgeting against. Key open items: pricing tiers (consumer + enterprise), the open/closed IP cut, and the customer-funded-growth thesis all want canon decision documents before they harden into accidental policy.

---

## What's new since the last brief

Five things, in order of importance.

**1. The unit economics survived contact with actual Cloudflare pricing.** Workers Paid is $5/mo with 10M requests + 30M CPU-ms included; Durable Objects price at $0.15/M requests plus duration; the WebSocket Hibernation API removes duration billing for idle connected sockets; incoming WS messages bill at a 20:1 ratio and outgoing messages are free. A typical small TinCan conversation (2 participants, 30 min, 50 messages) costs ~$0.00003 in raw infrastructure. Per-account variable cost at typical engagement: half a cent to a cent per month. Across every plausible scale (1M to 200M accounts), gross margin sits north of 95%.

**2. The self-host defense is structural, not constructed.** Anyone running their own AMS deployment pays Cloudflare's $5/mo Workers Paid minimum *whether they use $0.01 or $4 of it*. Anyone whose TinCan bill is below $5/mo is strictly worse off self-hosting before counting maintenance time. The moat doesn't require us to be clever about packaging or to gate features — it's the shape of CF's own pricing model working in our favor.

**3. Three structurally-locked verticals, not one.** Same code, same canon, same wire — three completely different ICPs with three different urgent problems and three different ways incumbents are blocked from shipping the same answer. AI-support handoff, Stripe-for-agent-conversations dev infra, and watching-room observability.

**4. The strategy is customer-funded B2C-funds-B2B, no funders.** Solo founder, capacity to train recruits but no current headcount. Decided: do not raise from VCs. Instead: ship B2C, compound to ~$8–10K MRR, then fund first B2B hire from accumulated MRR plus their first enterprise contracts. Subsequent hires funded by contracts the previous hire closes. The architecture supports this because consumer tiers scale solo, B2B verticals stay manageable until ~$1M ARR, and the canon itself is onboarding material for trainable hires.

**5. Enterprise tier structure clarified.** Four candidate tiers above the consumer ladder (E1 Workspace through E4 Sovereign), anchored against Posthog/Supabase/GitLab/Mattermost/HashiCorp comp data. E4 (off-CF substrate) deferred until headcount exists to deliver it.

---

## Brand voice posture

The pitch posture follows a "we know that" pattern that respects the buyer's intelligence and acknowledges the legitimate alternative before naming what they're paying for. Operator-authored canonical pitch:

> "You're smart and capable, we know that. You could host it yourself, we know that. But man hours and support have a cost, we know that. We priced it so cheap that you shouldn't have to think about how much time and effort it would cost in labor to deploy, host and keep it up to date. We will even do enterprise costs for discrete deployment."

Triple repeat of "we know that" acknowledges competence and the legitimate alternative — they are smart, they could host it, support has a cost — then breaks pattern with the value proposition. Frames pricing as buying labor and accountability, not buying access to magic.

The voice extends from $1.99 consumer pricing to enterprise contracts unchanged. At enterprise scale: "You're an enterprise. You could deploy this in your own Cloudflare account in an afternoon. We'd actually help you do it — the repo is right there. Or we can run it for you with SLAs. Or dedicated. Or, if you need it, on your own metal. Pricing reflects the labor it actually takes. We don't charge for the wire, we charge for the work. The exit is always real."

What doesn't change between $1.99 and six figures: the openness, the explicit acknowledgment that they could leave, the framing of price as labor and accountability rather than rent. That's what makes the same posture scale without sounding like two different companies.

---

## Strategy: B2C funds B2B hires

**Phase 1 — months 0–2 (solo).** Ship consumer tiers (Free / $1.99 Tin / $4.99 Foil / $9.99 Industrial). Stripe billing, tier-limit enforcement, homepage rewrite, open-source-with-clear-license framing. Mostly billing integration; product is built.

**Phase 2 — months 2–4 (still solo).** Distribution. One good HN post, X thread, dev newsletter mentions. Goal: several thousand free signups, 5–15% paid conversion because price floor is so low it doesn't trigger evaluation. Revenue: $500–$3K MRR by end of phase.

**Phase 3 — months 4–8 (still solo).** Compound. Product is in market, integrations being built by users, revenue grows from $3K toward $10K MRR. Around the $8–10K MRR mark, first hire is credibly fundable with margin of safety.

**Phase 4 — month 8+.** First B2B hire (sales-engineer / customer-success hybrid at remote/international rates ~$80–110K all-in). They take over the AI-support handoff vertical landing page, run discovery, close the first 2–3 enterprise contracts in months 9–12. Each contract $25K–$100K ARR. Now B2B revenue funds hire #2; B2C revenue is the stable floor underneath everything.

The path beats raising because it preserves architectural discipline (no growth-rate metrics that don't fit substrate-positioning), preserves optionality (can raise later from revenue + proof if a swing-for-the-fences moment emerges), and validates product-market fit through actual revenue rather than VC enthusiasm. The path beats enterprise-prepay-first because lower concentration risk (lose 50 small accounts vs. one big customer) and stronger trust signal when enterprise motion does start (real install base to point at during procurement).

---

## Unit economics — the math, compactly

| Layer | Raw CF cost | TinCan price | Markup |
|---|---|---|---|
| Free tier (~5 convos / 100 msgs/mo) | <$0.001 | $0 | n/a — loss leader |
| $1.99 "Tin" (~100 convos / 5K msgs) | ~$0.005–$0.01 | $1.99 | ~200–400× |
| $4.99 "Foil" (~1K convos / 50K msgs) | ~$0.10 | $4.99 | ~50× |
| $9.99 "Industrial" (~10K convos / 500K msgs) | ~$1.00 | $9.99 | ~10× |
| Overage | trivial | $0.001/msg or $0.01/conv | 30–300× |

That's not normal SaaS economics — typical SaaS is 75–85% — and it's the direct consequence of vodka discipline. Every architectural decision that resisted scope creep ended up paying off as margin.

**One caveat that matters before any of these numbers commit:** these are modeled assuming the WebSocket Hibernation API actually fires under real load. If chatty agents keep DOs awake, duration cost dominates and the model warps by 10–50×. Wants measurement under realistic traffic before any tier limit is binding.

---

## The three structurally-locked B2B verticals

Each one has the same shape: real demand today, near-zero additional build on top of AMS+TinCan, and incumbents who can't ship the same product without contradicting their own pricing or positioning.

**1. AI-support handoff (B2B mid-market, $19–49/seat/mo).** Every B2C company runs an AI chatbot now and they all have the same broken pattern: AI fails, customer asks for a human, ticket opens, context dies, rep starts over. TinCan's magic-link drop-in solves it natively — rep enters the existing conversation with full transcript, can co-pilot or take over. Intercom can't ship this because they charge $0.99 per Fin AI resolution and the human-co-pilot pattern *reduces resolution count* — economically toxic to their model. Build cost on our side: a landing page and ~5 lines of widget JS. **Fastest revenue of the three; this is what the first B2B hire goes after.**

**2. Stripe-for-agent-conversations (dev infra, $0.001–$0.01/conv).** Every agent startup is rebuilding chat right now and none of them want to. Pusher / Ably / PubNub have the raw pubsub but force everyone to build the agent-conversation pattern themselves; they can't pivot without alienating a decade of IoT/dashboard/gaming customers. OpenAI/Anthropic explicitly don't want devs on a neutral substrate. D0020's open-substrate posture is exactly the thing they cannot offer without contradicting their product strategy. Build cost: zero, AMS already does this. Work is positioning + docs site + a few sample integrations.

**3. Watching-room observability (B2B ops, $29–99/viewer-seat).** PMs and CS heads at companies running 10+ agents have nowhere to *watch* their agents work. LangSmith / Helicone / Arize are dev tools — logs, traces, evals — built for engineers. TinCan portal in read-only mode + "inject a message" affordance = the head of CS watches her agent argue with a refund request, pings "just give them the refund," walks away. LangSmith pivoting to non-technical buyers alienates their dev base. Highest ARPU but longest education curve.

The structural fact across all three: this isn't a head start to defend. It's a permanent architectural absence in incumbents.

---

## Enterprise tier structure (four candidates above consumer ladder)

| Tier | Name | Price | Anchored to | Deliverable solo? |
|---|---|---|---|---|
| E1 | Workspace | $599–$999/mo or $7K–$12K/yr | Supabase Team ($599), Posthog Enterprise ($2K) | Yes |
| E2 | Dedicated | $2K–$10K/mo or $25K–$100K/yr | GitLab Ultimate Plus, HCP Vault Dedicated, Posthog $54K median | Mostly — needs hire #1 for sales cycles |
| E3 | BYO-CF | E2 license + customer's own CF bill | GitLab self-managed, Mattermost Enterprise self-hosted | Yes — script-templated deploy |
| E4 | Sovereign | $250K+/yr, 6-month engagement minimum | Mattermost Enterprise Advanced, Terraform Enterprise ($300K) | **No — defer until team exists** |

Compliance gates the price jumps, not features. The boundary between Pro and Team in every comp surveyed isn't more features — it's "we'll sign a BAA, we have SOC2 Type II, our SSO works with your IdP, our audit log is exportable." Self-managed pricing equals SaaS pricing in market-standard practice (GitLab does this explicitly); customer absorbs infra cost on top. E3 (BYO-CF) follows that pattern directly.

E4 is genuinely a different product — porting AMS off CF Workers + DOs is real engineering work and changes the architectural story (D0006/D0026 violation). Pricing it as $250K minimum with 6-month engagement self-selects out buyers who don't actually need it; treating it as aspirational rather than available is the honest posture until headcount can support it.

---

## Open / closed IP cut

**Stays open under permissive license** (Apache 2.0 or MIT): AMS Worker, SPEC.md, protocol docs, MCP server/SDK, sample integrations, klappy.dev canon, oddkit, governance methodology, and a deliberately-bare reference TinCan that exists to prove D0026 ("TinCan is one removable UI layer"). These are not optional — closing any of them turns the open-substrate positioning from architecture into marketing copy, and sophisticated developers smell that.

**Stays closed under commercial license:** the productized verticals (handoff product, watching-room product, branded TinCan SaaS), the hosted SLA-backed AMS service, brand and trademarks, customer dashboards, billing/admin tooling, runbooks, enterprise features (SSO, SCIM, audit export, data residency, on-prem deploy assistance).

**Critical operational note:** the public reference TinCan and the productized TinCan need to fork the moment branding, billing, or feature-gating land. Today they're a single artifact that's both. Every productization feature accumulated in the public repo is a feature given away to competitors.

The solo-founder reality makes this canon decision more urgent, not less. A future hire shouldn't have to ask the founder which side of the line each new feature falls on. The canon needs to make the test mechanical.

---

## Revenue scenarios — honest, the path I'm planning against

| Scenario | Accounts | Paid | ARR | What it requires |
|---|---|---|---|---|
| **S1 — niche tool (the path)** | 1M | 80K | ~$3M | Solo + 1–3 hires funded by revenue |
| S2 — real traction (upside) | 10M | 800K | ~$30M | Team of 5–10, possibly raise from strength |
| S3 — category-defining | 50M | 5M | ~$200M | Real org, would require funding decision |
| S4 — dial tone | 200M | 24M | ~$1.1–2.3B | Industry infrastructure, different company |

**S1 is what I'm planning against and budgeting for.** It's a sustainable indie product, capital-efficient, doesn't require funders. S2+ is upside that the architecture supports but I am not budgeting toward. The thing that's unusual about this distribution isn't the upside — startups model billion-dollar tails all the time. It's that S1 is profitable and indie-sustainable on day one with 95%+ gross margins, which means there's no "if we hit S2+" pressure that forces premature scaling.

CF cost stays under 1–5% of revenue in every scenario.

---

## Risks worth pressure-testing

- **Consumer launch may underperform.** If the HN post gets 5 upvotes instead of 500, funnel timeline slides 6–12 months. The whole strategy depends on Phase 2 distribution working. Mitigation: sequence of distribution shots not single-launch bet (soft launch, integration-of-the-month posts, agent-startup outreach, content marketing).
- **$1.99 floor may not convert.** Perceived value too low ("if it's that cheap it can't be real") or pulls in low-effort users who clog support. Mitigation: A/B test entry tier early.
- **Churn at $1.99 floor.** Net revenue retention 50–70% typical at this price point. Steady-state subscriber count plateaus at ~3× monthly net adds. May extend time-to-first-hire from 6 to 12 months.
- **Solo support volume scales with signups.** Some non-zero fraction will email regardless of self-serve docs. Mitigation: ruthless docs, decline email support on consumer tiers (with kindness, in the FAQ), community channel.
- **Hibernation effectiveness.** Whole cost model rests on it. Needs measurement under realistic agent traffic before tier limits commit. If wrong, margins compress 10–30 points but stay positive.
- **Stripe processing fees on $1.99 monthly.** ~18% gone before margin. Solution: default to annual prepay ($23.88, ~4% fees), price monthly punitively at $2.99.
- **Competitive timing.** If Slack/Discord/OpenAI/Anthropic ship competing products in months 4–8, we're behind. Open-substrate positioning (D0020) is the moat; pricing alone isn't defensible. Mitigation: file the open/closed IP canon early, stay public enough that prior art is established without tipping competitive response before customers lock in.
- **Agent-economy timeline.** MPP, x402, Stripe SPT are real but young. Real revenue from agent microtransactions might be $0 for 2–3 years. **Do not budget against it.** Treat as upside.
- **CF concentration risk.** If CF raises DO duration prices 50%, margins drop a few points. Not catastrophic. Self-hosting alternative paths (Hetzner+OpenWorkers) exist as a hedge but only matter at $10M+ infra spend.

---

## What I want from you both

The asks have sharpened from the prior version of this brief. With customer-funded B2C-funds-B2B as the load-bearing thesis, what would actually unblock me, in order:

**1. Sharpen the consumer launch positioning before the HN post.** The pitch posture (the "we know that" pattern) reads to me, but I'm in the bubble. Does it land for an outsider? What feels off, what feels missing? The HN post draft is the specific artifact — I'd rather get pressure-tested on positioning before launch than after silence.

**2. Make 3 introductions in the agent-startup ecosystem for early integration partnerships.** This is where your networks are most useful. Three good integrations (someone using TinCan + AMS visibly in their agent stack, posting about it) are worth more than 100 cold HN signups. The integration partners don't need to pay; they need to be visibly using us, and they need to be the kind of agent startup other agent startups pay attention to.

**3. Pressure-test the sequencing.** The plan is "ship B2C in 8 weeks, compound for 6 months, then make first B2B hire from revenue." Where would you push back on that timeline? What's the most likely failure mode you'd flag from your read of the market? Specifically: am I underestimating the B2B sales cycle length once the hire is in seat, and should I therefore be hiring earlier and funding more aggressively?

**4. Decide whether the open/closed IP cut should be canon-document-now or canon-document-later.** Argument for now: solo founder shipping toward enterprise contracts can't afford ambiguity, and a future hire shouldn't have to ask me which side of the line each feature falls on. Argument for waiting: writing the cut prematurely commits us before market signals come in. I lean "now" but it's not obvious.

I'd also welcome any framing I missed. Today's pass was top-down (cost model → market → IP → strategy), which means I might be missing bottom-up signals from real users that contradict the architecture-first story.

---

## Status of underlying work

Encoded artifacts produced today (saved as Dolcheo+ entries in `encodes/` alongside this summary):

1. Unit-economics insight (encode-01)
2. Three-vertical observation (encode-02)
3. Open/closed IP cut proposal (encode-03)
4. Candidate consumer tier structure proposal (encode-04)
5. Brand voice posture insight (encode-05) *new*
6. Candidate enterprise tier structure E1–E4 proposal (encode-06) *new*
7. Customer-funded B2C-funds-B2B strategy proposal (encode-07) *new*
8. Open-core enterprise pricing market data (encode-08) *new*

None of these are canon yet — proposals carry status `proposed` and need decision documents before binding. Three are good candidates for the next round of D-series canon work: the IP cut (encode-03), the strategy thesis (encode-07), and possibly the consumer tier structure (encode-04). The enterprise tier structure (encode-06) and brand voice (encode-05) probably want to mature with market signal before becoming canon.

**Standing items unchanged:** TinCan v0.1.0 tag still uncut, mcp.ts SDK rewrite still scoped against 1,401-line baseline, P0002 accepted→executed flip still pending PR #166 merge, AMS bundle work still planned, credentials in project instructions still unrotated.
