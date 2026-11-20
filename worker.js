/**
 * FairQuote quote reader: a small Cloudflare Worker.
 *
 * The app sends a photo of a repair quote here. This Worker asks an AI model to read it and
 * returns the lines as JSON. The AI key lives only in this Worker's secrets, never in the app.
 *
 * Secrets to set (Worker -> Settings -> Variables and Secrets):
 *   ANTHROPIC_API_KEY  required   your AI provider key
 *   APP_TOKEN          required   a long random code; the same code goes in the app's Settings
 * Optional plain variables:
 *   MODEL              defaults to claude-sonnet-5-5
 *   MAX_PER_HOUR       reads allowed per code per hour in this region, default 60
 *   DAILY_READ_CAP     photo reads allowed per day across ALL users, default 300 (your spend ceiling)
 *   DEVICE_DAILY_CAP   photo reads per device (and per network address) per day, default 5
 *   EBAY_CLIENT_ID / EBAY_CLIENT_SECRET   optional, turns on live parts listings with prices (free eBay developer keys)
 *   EBAY_CAMPAIGN_ID   optional eBay Partner Network campaign number, to earn on parts purchases
 *   PARTS_DAILY_CAP    new parts searches per day, default 150
 *   VIDEO_DAILY_CAP    new video searches per day, default 80 (the free YouTube quota allows about 100)
 * Optional binding:
 *   FQ_KV              a Workers KV namespace; keeps the daily counts exact across regions. Without it the
 *                      counts are kept in memory per instance, which is weaker.
 *   YOUTUBE_API_KEY    optional secret; turns on the how-to videos that play inside the app
 *   MAPS_EMBED_KEY     optional; a Google Maps Embed API key (restricted to that API) for the in-app shop map
 *
 * The photo is passed through and not stored or logged.
 */

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_IMAGE_CHARS = 5_500_000; // about 4 MB of image once base64 encoded

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-fq-token, x-fq-device",
  "access-control-max-age": "86400"
};

const hits = new Map(); // small, per-isolate guard against runaway loops (not a billing control)

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}

function limited(token, max) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const k = token + ":" + hour;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 500) for (const key of hits.keys()) if (!key.endsWith(":" + hour)) hits.delete(key);
  return n > max;
}

// Daily usage counters. KV when bound (exact enough for a spend ceiling), else per-instance memory.
const mem = new Map();
async function bump(env, key, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const k = "u:" + day + ":" + key;
  let n;
  if (env.FQ_KV) {
    n = (parseInt(await env.FQ_KV.get(k), 10) || 0) + 1;
    if (n <= limit) await env.FQ_KV.put(k, String(n), { expirationTtl: 172800 });
  } else {
    n = (mem.get(k) || 0) + 1;
    if (n <= limit) mem.set(k, n);
    if (mem.size > 2000) for (const x of mem.keys()) if (!x.startsWith("u:" + day)) mem.delete(x);
  }
  return n <= limit;
}
async function unbump(env, key) {
  const day = new Date().toISOString().slice(0, 10);
  const k = "u:" + day + ":" + key;
  if (env.FQ_KV) {
    const n = parseInt(await env.FQ_KV.get(k), 10) || 0;
    if (n > 0) await env.FQ_KV.put(k, String(n - 1), { expirationTtl: 172800 });
  } else if (mem.get(k) > 0) mem.set(k, mem.get(k) - 1);
}
function deviceKey(request) {
  const d = String(request.headers.get("x-fq-device") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 60);
  return d || "none";
}

function buildPrompt(vehicle, catalog) {
  const jobs = (catalog || []).slice(0, 80).map((j) => `${j.id}: ${j.name}`).join("\n");
  const veh = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : "unknown";
  return `You read photos of vehicle repair quotes and invoices and return ONLY valid JSON.

Vehicle (for context only): ${veh}

Return this shape:
{"shop": string, "lines": [{"desc": string, "type": "parts"|"labor"|"combined"|"fee"|"tax"|"discount"|"total"|"other", "qty": number, "amount": number, "hours": number|null, "rate": number|null, "jobId": string}]}

Rules:
- One entry per printed line item. "amount" is the line total in dollars as a plain number.
- type "parts" for parts or materials, "labor" for labor, "combined" when one line includes both, "fee" for shop supplies, disposal or environmental charges, "tax" for sales tax, "discount" for discounts, "total" for subtotals and grand totals.
- If a labor line shows hours or an hourly rate, fill "hours" and "rate"; otherwise null.
- "jobId": choose the single best matching id from the job list below, or "" if none fits. Match the repair, not the price.
- Do NOT include or copy any customer name, address, phone number, email, licence plate, VIN or payment details. Leave them out entirely.
- If the image is not a repair quote or invoice, return {"shop":"","lines":[]}.
- Never invent lines. If a number is unreadable, omit that line.

Job list:
${jobs}`;
}

function extractJson(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  return null;
}

function clean(q) {
  const types = new Set(["parts", "labor", "combined", "fee", "tax", "discount", "total", "other"]);
  const lines = (Array.isArray(q && q.lines) ? q.lines : []).slice(0, 60).map((l) => ({
    desc: String((l && l.desc) || "").slice(0, 140),
    type: types.has(l && l.type) ? l.type : "other",
    qty: Number(l && l.qty) || 1,
    amount: Number(l && l.amount) || 0,
    hours: l && l.hours != null && !isNaN(Number(l.hours)) ? Number(l.hours) : null,
    rate: l && l.rate != null && !isNaN(Number(l.rate)) ? Number(l.rate) : null,
    jobId: String((l && l.jobId) || "").slice(0, 40)
  }));
  return { shop: String((q && q.shop) || "").slice(0, 80), lines };
}

// Finds embeddable how-to videos for a repair. Results are cached for a week so one search serves many users.
async function videos(env, url) {
  if (!env.YOUTUBE_API_KEY) return json({ ok: false, error: "Videos are not set up on the server yet." }, 501);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  if (!q) return json({ ok: false, error: "Missing search." }, 400);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://fq-cache.invalid/videos?q=" + encodeURIComponent(q.toLowerCase()));
  if (cache) { const hit = await cache.match(key); if (hit) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", ...CORS } }); }
  if (!(await bump(env, "all:video", Number(env.VIDEO_DAILY_CAP) || 80))) return json({ ok: false, error: "Video search is busy today. Try again tomorrow." }, 429);
  const api = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoSyndicated=true" +
    "&safeSearch=strict&maxResults=4&relevanceLanguage=en&regionCode=US&q=" + encodeURIComponent(q) + "&key=" + encodeURIComponent(env.YOUTUBE_API_KEY);
  let res;
  try { res = await fetch(api); } catch (e) { return json({ ok: false, error: "Could not reach the video service." }, 502); }
  if (!res.ok) return json({ ok: false, error: "The video service is unavailable right now (" + res.status + ")." }, 502);
  const data = await res.json();
  const list = (data.items || [])
    .filter((i) => i && i.id && /^[\w-]{11}$/.test(i.id.videoId || ""))
    .map((i) => ({ id: i.id.videoId, title: String((i.snippet && i.snippet.title) || "").slice(0, 120), channel: String((i.snippet && i.snippet.channelTitle) || "").slice(0, 60) }));
  const out = JSON.stringify({ ok: true, videos: list });
  if (cache && list.length) await cache.put(key, new Response(out, { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } }));
  return new Response(out, { status: 200, headers: { "content-type": "application/json", ...CORS } });
}

// Live parts listings (price, photo, where the seller ships from) from the eBay Browse API. Needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.
let ebayTok = { v: "", exp: 0 };
async function ebayToken(env) {
  if (ebayTok.v && Date.now() < ebayTok.exp) return ebayTok.v;
  const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + btoa(env.EBAY_CLIENT_ID + ":" + env.EBAY_CLIENT_SECRET) },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope")
  });
  if (!r.ok) return "";
  const j = await r.json();
  ebayTok = { v: j.access_token || "", exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
  return ebayTok.v;
}
async function parts(env, url) {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return json({ ok: false, error: "Parts search is not set up on the server yet." }, 501);
  const g = (n, m) => (url.searchParams.get(n) || "").trim().slice(0, m);
  const q = g("q", 100), year = g("year", 4), make = g("make", 30), model = g("model", 40);
  const zip = /^\d{5}$/.test(g("zip", 5)) ? g("zip", 5) : "";
  if (!q) return json({ ok: false, error: "Missing search." }, 400);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://fq-cache.invalid/parts?" + encodeURIComponent([q, year, make, model, zip.slice(0, 3)].join("|").toLowerCase()));
  if (cache) { const hit = await cache.match(key); if (hit) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", ...CORS } }); }
  if (!(await bump(env, "all:parts", Number(env.PARTS_DAILY_CAP) || 150))) return json({ ok: false, error: "Parts search is busy today. Try again tomorrow." }, 429);
  let tok;
  try { tok = await ebayToken(env); } catch (e) { tok = ""; }
  if (!tok) return json({ ok: false, error: "The parts service is unavailable right now." }, 502);
  const search = async (withFit) => {
    let api = "https://api.ebay.com/buy/browse/v1/item_summary/search?category_ids=6030&limit=12&filter=" + encodeURIComponent("buyingOptions:{FIXED_PRICE},priceCurrency:USD") + "&q=" + encodeURIComponent(q);
    if (withFit && year && make && model) api += "&compatibility_filter=" + encodeURIComponent("Year:" + year + ";Make:" + make + ";Model:" + model);
    const headers = { authorization: "Bearer " + tok, "x-ebay-c-marketplace-id": "EBAY_US" };
    if (zip) headers["x-ebay-c-enduserctx"] = "contextualLocation=country=US,zip=" + zip;
    return fetch(api, { headers });
  };
  let res, fit = !!(year && make && model);
  try {
    res = await search(true);
    if (res.status === 400 && fit) { res = await search(false); fit = false; }
  } catch (e) { return json({ ok: false, error: "Could not reach the parts service." }, 502); }
  if (!res.ok) return json({ ok: false, error: "The parts service is unavailable right now (" + res.status + ")." }, 502);
  const data = await res.json();
  const camp = String(env.EBAY_CAMPAIGN_ID || "").replace(/[^0-9]/g, "");
  const list = (data.itemSummaries || []).map((i) => {
    const price = Number(i.price && i.price.value);
    const loc = i.itemLocation || {};
    const ship = i.shippingOptions && i.shippingOptions[0] && i.shippingOptions[0].shippingCost ? Number(i.shippingOptions[0].shippingCost.value) : null;
    let link = String(i.itemWebUrl || "");
    if (!/^https:\/\/[\w.-]*ebay\.com\//.test(link)) return null;
    if (camp) link += (link.indexOf("?") > -1 ? "&" : "?") + "mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=" + camp + "&toolid=10001&mkevt=1";
    return {
      title: String(i.title || "").slice(0, 110), price: price, ship: ship != null && !isNaN(ship) ? ship : null,
      img: String((i.image && i.image.imageUrl) || (i.thumbnailImages && i.thumbnailImages[0] && i.thumbnailImages[0].imageUrl) || ""),
      cond: String(i.condition || "").slice(0, 30),
      from: [loc.city, loc.stateOrProvince || loc.country].filter(Boolean).join(", ").slice(0, 40),
      seller: String((i.seller && i.seller.username) || "").slice(0, 30), fb: i.seller && i.seller.feedbackPercentage ? String(i.seller.feedbackPercentage).slice(0, 6) : "",
      url: link
    };
  }).filter((x) => x && x.price > 0 && /^https:\/\//.test(x.img || "https://")).slice(0, 8);
  const out = JSON.stringify({ ok: true, fit: fit, items: list });
  if (cache && list.length) await cache.put(key, new Response(out, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } }));
  return new Response(out, { status: 200, headers: { "content-type": "application/json", ...CORS } });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "fairquote-reader" });
    const isConfig = url.pathname === "/config" && request.method === "GET";
    const isVideos = url.pathname === "/videos" && request.method === "GET";
    const isRead = url.pathname === "/read" && request.method === "POST";
    const isParts = url.pathname === "/parts" && request.method === "GET";
    if (!isConfig && !isVideos && !isRead && !isParts) return json({ ok: false, error: "Not found." }, 404);

    if (!env.APP_TOKEN || (isRead && !env.ANTHROPIC_API_KEY)) return json({ ok: false, error: "The server is not set up yet." }, 500);
    const token = request.headers.get("x-fq-token") || "";
    if (token !== env.APP_TOKEN) return json({ ok: false, error: "The access code does not match. Check Settings." }, 401);
    if (limited(token, Number(env.MAX_PER_HOUR) || 60)) return json({ ok: false, error: "Too many requests this hour. Try again later." }, 429);
    if (isConfig) return json({ ok: true, maps: env.MAPS_EMBED_KEY || "", videos: !!env.YOUTUBE_API_KEY, parts: !!(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET) });
    if (isVideos) return videos(env, url);
    if (isParts) return parts(env, url);

    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: "Bad request." }, 400); }
    const image = String((body && body.image) || "");
    if (!image || image.length > MAX_IMAGE_CHARS) return json({ ok: false, error: "The photo is missing or too large." }, 413);

    const perDevice = Number(env.DEVICE_DAILY_CAP) || 5;
    const ip = request.headers.get("cf-connecting-ip") || "noip";
    const kDev = "dev:" + deviceKey(request), kIp = "ip:" + ip, kAll = "all:read";
    const used = [];
    const refund = async () => { for (const k of used) await unbump(env, k); };
    if (!(await bump(env, kDev, perDevice))) {
      return json({ ok: false, error: "You have used today's free quote reads. Try again tomorrow, or type the quote in." }, 429);
    }
    used.push(kDev);
    if (!(await bump(env, kIp, perDevice * 3))) {
      await refund();
      return json({ ok: false, error: "You have used today's free quote reads. Try again tomorrow, or type the quote in." }, 429);
    }
    used.push(kIp);
    if (!(await bump(env, kAll, Number(env.DAILY_READ_CAP) || 300))) {
      await refund();
      return json({ ok: false, error: "Photo reading is busy today. Please type the quote in, or try again tomorrow." }, 429);
    }
    used.push(kAll);

    const callAI = (withTemp) => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(Object.assign({
        model: env.MODEL || DEFAULT_MODEL,
        max_tokens: 2500,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: buildPrompt(body.vehicle, body.catalog) }
        ] }]
      }, withTemp ? { temperature: 0 } : {}))
    });
    let res, detail = "";
    try {
      res = await callAI(true);
      if (res.status === 400) {
        detail = await res.text().catch(() => "");
        if (/temperature/i.test(detail)) { res = await callAI(false); detail = ""; }
      }
    } catch (e) {
      await refund();
      return json({ ok: false, error: "Could not reach the reader. Try again." }, 502);
    }
    if (!res.ok) {
      await refund();
      if (!detail) detail = await res.text().catch(() => "");
      let why = "";
      try { why = (JSON.parse(detail).error || {}).message || ""; } catch (e) { why = ""; }
      if (/credit|billing/i.test(why)) why = "The reader account needs credit.";
      else if (/model/i.test(why)) why = "The reader model name is not accepted.";
      else why = "";
      return json({ ok: false, error: "The reader is unavailable right now (" + res.status + ")." + (why ? " " + why : "") }, 502);
    }

    const out = await res.json();
    const text = ((out.content || []).find((c) => c.type === "text") || {}).text || "";
    const parsed = extractJson(text);
    if (!parsed) { await refund(); return json({ ok: false, error: "The quote could not be read. Try a clearer photo." }, 422); }
    return json({ ok: true, quote: clean(parsed) });
  }
};
