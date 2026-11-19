// Run with: node worker.test.mjs   (uses a fake AI service; no network)
import assert from "node:assert";
import worker from "./worker.js";
const env = { ANTHROPIC_API_KEY: "k", APP_TOKEN: "secret" };
const req = (path, init) => new Request("https://x.test" + path, init);
const post = (body, tok = "secret") => req("/read", { method: "POST", headers: { "x-fq-token": tok, "content-type": "application/json" }, body: JSON.stringify(body) });
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

ok((await worker.fetch(req("/health"), env)).status === 200, "health");
ok((await worker.fetch(post({ image: "abc" }, "wrong"), env)).status === 401, "bad token");
ok((await worker.fetch(post({}), env)).status === 413, "missing image");
ok((await worker.fetch(req("/read", { method: "OPTIONS" }), env)).status === 204, "cors");

globalThis.fetch = async (u, init) => {
  const b = JSON.parse(init.body);
  ok(init.headers["x-api-key"] === "k", "key sent to AI");
  ok(b.messages[0].content[0].source.data === "abc", "image forwarded");
  return new Response(JSON.stringify({ content: [{ type: "text", text: 'Here:\n{"shop":"Joe","lines":[{"desc":"Brake pads","type":"parts","amount":"85","hours":null,"rate":null,"jobId":"brakes_f"},{"desc":"x","type":"weird","amount":1}]}' }] }), { status: 200 });
};
const r = await worker.fetch(post({ image: "abc", vehicle: { make: "Honda" }, catalog: [{ id: "brakes_f", name: "Front brake pads" }] }), env);
const j = await r.json();
ok(r.status === 200 && j.ok, "read ok");
ok(j.quote.lines[0].amount === 85 && j.quote.lines[1].type === "other", "cleaned");

// videos
const vreq = (q, tok = "secret") => req("/videos?q=" + encodeURIComponent(q), { headers: { "x-fq-token": tok } });
ok((await worker.fetch(vreq("brake pads", "wrong"), env)).status === 401, "videos need the token");
ok((await worker.fetch(vreq("brake pads"), env)).status === 501, "videos off without a key");
const env2 = { ...env, YOUTUBE_API_KEY: "yt" };
ok((await worker.fetch(vreq("  "), env2)).status === 400, "videos need a search");
let seen = "";
globalThis.fetch = async (u) => {
  seen = String(u);
  return new Response(JSON.stringify({ items: [
    { id: { videoId: "abcdefghijk" }, snippet: { title: "Replace brake pads", channelTitle: "Garage" } },
    { id: { videoId: "bad" }, snippet: { title: "Broken id" } }
  ] }), { status: 200 });
};
const vr = await worker.fetch(vreq("2016 Honda Accord front brake pads how to"), env2);
const vj = await vr.json();
ok(vr.status === 200 && vj.ok && vj.videos.length === 1 && vj.videos[0].id === "abcdefghijk", "videos cleaned");
ok(seen.includes("videoEmbeddable=true") && seen.includes("safeSearch=strict"), "embeddable and safe only");
// daily caps
globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"shop":"","lines":[]}' }] }), { status: 200 });
const cenv = { ...env, DEVICE_DAILY_CAP: "2", DAILY_READ_CAP: "4" };
const dpost = (dev, ip = "1.1.1.1") => req("/read", { method: "POST", headers: { "x-fq-token": "secret", "x-fq-device": dev, "cf-connecting-ip": ip, "content-type": "application/json" }, body: JSON.stringify({ image: "abc" }) });
ok((await worker.fetch(dpost("a"), cenv)).status === 200, "first read ok");
ok((await worker.fetch(dpost("a"), cenv)).status === 200, "second read ok");
ok((await worker.fetch(dpost("a"), cenv)).status === 429, "device cap");
ok((await worker.fetch(dpost("b", "2.2.2.2"), cenv)).status === 200, "other device still ok");
ok((await worker.fetch(dpost("c", "3.3.3.3"), cenv)).status === 429, "global daily cap");
const cfg = await (await worker.fetch(req("/config", { headers: { "x-fq-token": "secret" } }), { ...env, MAPS_EMBED_KEY: "mk" })).json();
ok(cfg.ok && cfg.maps === "mk" && cfg.videos === false, "config");
ok((await worker.fetch(req("/config", { headers: { "x-fq-token": "no" } }), env)).status === 401, "config needs the token");
console.log(n + " worker checks passed");
