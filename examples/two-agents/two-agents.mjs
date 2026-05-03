// two-agents.mjs — bare-wire two-agent demo over the AMS protocol.
//
// Runs the SPEC §3.2 demo gate without any agent runtime: two Node "agents"
// in one process, each owning a stream, talking through one AMS conversation.
// Verifies the structural-self-exclusion property from D0009 along the way.
//
// Usage:
//   AMS_HOST=http://127.0.0.1:8787 node two-agents.mjs
//   AMS_HOST=https://ams.klappy.dev node two-agents.mjs
//
// Output is a labelled transcript of the wire traffic. Exit code 0 on success.

import { createAccount, createConversation, connect } from "./ams-client.mjs";

function rel(start) {
  const ms = Date.now() - start;
  return `+${String(ms).padStart(4, "0")}ms`;
}
function log(start, who, msg) {
  console.log(`${rel(start)} ${who.padEnd(8)} ${msg}`);
}

const NS_A = `demo-a-${Math.floor(Math.random() * 1e6)}`;
const NS_B = `demo-b-${Math.floor(Math.random() * 1e6)}`;
const start = Date.now();

log(start, "klappy", `creating account in namespace ${NS_A}…`);
const accA = await createAccount(NS_A);
log(start, "klappy", `account_id=${accA.account_id}`);

log(start, "ian",    `creating account in namespace ${NS_B}…`);
const accB = await createAccount(NS_B);
log(start, "ian",    `account_id=${accB.account_id}`);

log(start, "klappy", `minting conversation under ${NS_A}…`);
const conv = await createConversation(accA.credential, NS_A, {
  stream_name: "klappy-assistant",
  metadata: { purpose: "two-agent demo" },
  stream_metadata: { display_name: "Klappy" },
});
log(start, "klappy", `magic_link=${conv.magic_link}`);

log(start, "klappy", "connecting as klappy-assistant (writer)…");
const wsKlappy = connect(conv.magic_link, accA.credential, {
  stream_name: "klappy-assistant",
  stream_metadata: { display_name: "Klappy" },
});
const joinedKlappy = await wsKlappy.ready();
log(start, "klappy", `joined: stream_id=${joinedKlappy.stream_id} self_subscribe=${joinedKlappy.self_subscribe} peers=${JSON.stringify(joinedKlappy.peers)}`);

log(start, "ian", "connecting with the magic link as ian-assistant…");
const wsIan = connect(conv.magic_link, accB.credential, {
  stream_name: "ian-assistant",
  stream_metadata: { display_name: "Ian" },
});

// Klappy will see a stream_joined for ian as soon as ian connects.
const klappySawIan = new Promise((resolve) => {
  wsKlappy.once("stream_joined", (frame) => resolve(frame));
});

const joinedIan = await wsIan.ready();
log(start, "ian", `joined: stream_id=${joinedIan.stream_id} peers=${JSON.stringify(joinedIan.peers)}`);

const klappyJoinNotice = await klappySawIan;
log(start, "klappy", `received stream_joined for peer: ${klappyJoinNotice.stream_name} owner=${klappyJoinNotice.owner_account_id}`);

// SPEC §3.2 — Klappy emits a token; Ian's side must receive it. Klappy must
// NOT receive its own token back (D0009 structural exclusion).
let klappyEcho = false;
wsKlappy.on("token", (frame) => {
  if (frame.owner_account_id === accA.account_id) klappyEcho = true;
});
const ianGotKlappyToken = new Promise((resolve) => {
  wsIan.once("token", (frame) => resolve(frame));
});

log(start, "klappy", 'emit token: "summarize the last commit on truthkit-proxy"');
wsKlappy.send("summarize the last commit on truthkit-proxy");

const ianRx = await ianGotKlappyToken;
log(start, "ian", `received token from ${ianRx.stream_name} (${ianRx.owner_account_id}): ${JSON.stringify(ianRx.data)} ts=${ianRx.ts}`);

// Now Ian "responds" — emits a token; Klappy must receive it.
const klappyGotIanToken = new Promise((resolve) => {
  wsKlappy.once("token", (frame) => resolve(frame));
});
log(start, "ian", 'emit token (the "summary"): "feat: add edge-wrapper conformance check"');
wsIan.send("feat: add edge-wrapper conformance check");

const klappyRx = await klappyGotIanToken;
log(start, "klappy", `received token from ${klappyRx.stream_name} (${klappyRx.owner_account_id}): ${JSON.stringify(klappyRx.data)} ts=${klappyRx.ts}`);

// Brief grace period for late frames; if Klappy was going to see its own
// emission, it would have arrived within the same broadcast loop tick as
// Ian's reception. 250ms is generous on a localhost or production link.
await new Promise((r) => setTimeout(r, 250));

// stream_left round trip on close.
const klappySawIanLeave = new Promise((resolve) => {
  wsKlappy.once("stream_left", (frame) => resolve(frame));
});
log(start, "ian", "closing…");
wsIan.close();
const leaveFrame = await klappySawIanLeave;
log(start, "klappy", `received stream_left for peer: ${leaveFrame.stream_name}`);

wsKlappy.close();

console.log("");
console.log("─── audit ───");
console.log(`klappy received own emission echo: ${klappyEcho ? "YES (FAIL — D0009 broken)" : "no (PASS — D0009 structural exclusion)"}`);
console.log(`klappy received ian's reply:       ${klappyRx?.data === "feat: add edge-wrapper conformance check" ? "YES (PASS — SPEC §3.2)" : "NO (FAIL)"}`);
console.log(`ian received klappy's request:     ${ianRx?.data === "summarize the last commit on truthkit-proxy" ? "YES (PASS — SPEC §3.2)" : "NO (FAIL)"}`);

if (klappyEcho || klappyRx?.data !== "feat: add edge-wrapper conformance check" || ianRx?.data !== "summarize the last commit on truthkit-proxy") {
  process.exitCode = 1;
}
