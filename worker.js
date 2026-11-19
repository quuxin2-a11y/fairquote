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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "fairquote-reader" });
    const isConfig = url.pathname === "/config" && request.method === "GET";
    const isVideos = url.pathname === "/videos" && request.method === "GET";
    const isRead = url.pathname === "/read" && request.method === "POST";
    if (!isConfig && !isVideos && !isRead) return json({ ok: false, error: "Not found." }, 404);

    if (!env.APP_TOKEN || (isRead && !env.ANTHROPIC_API_KEY)) return json({ ok: false, error: "The server is not set up yet." }, 500);
    const token = request.headers.get("x-fq-token") || "";
    if (token !== env.APP_TOKEN) return json({ ok: false, error: "The access code does not match. Check Settings." }, 401);
    if (limited(token, Number(env.MAX_PER_HOUR) || 60)) return json({ ok: false, error: "Too many requests this hour. Try again later." }, 429);
    if (isConfig) return json({ ok: true, maps: env.MAPS_EMBED_KEY || "", videos: !!env.YOUTUBE_API_KEY });
    if (isVideos) return videos(env, url);

    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: "Bad request." }, 400); }
    const image = String((body && body.image) || "");
    if (!image || image.length > MAX_IMAGE_CHARS) return json({ ok: false, error: "The photo is missing or too large." }, 413);

    const perDevice = Number(env.DEVICE_DAILY_CAP) || 5;
    const ip = request.headers.get("cf-connecting-ip") || "noip";
    if (!(await bump(env, "dev:" + deviceKey(request), perDevice)) || !(await bump(env, "ip:" + ip, perDevice * 3))) {
      return json({ ok: false, error: "You have used today's free quote reads. Try again tomorrow, or type the quote in." }, 429);
    }
    if (!(await bump(env, "all:read", Number(env.DAILY_READ_CAP) || 300))) {
      return json({ ok: false, error: "Photo reading is busy today. Please type the quote in, or try again tomorrow." }, 429);
    }

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: env.MODEL || DEFAULT_MODEL,
          max_tokens: 2500,
          temperature: 0,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: buildPrompt(body.vehicle, body.catalog) }
          ] }]
        })
      });
    } catch (e) {
      return json({ ok: false, error: "Could not reach the reader. Try again." }, 502);
    }
    if (!res.ok) return json({ ok: false, error: "The reader is unavailable right now (" + res.status + ")." }, 502);

    const out = await res.json();
    const text = ((out.content || []).find((c) => c.type === "text") || {}).text || "";
    const parsed = extractJson(text);
    if (!parsed) return json({ ok: false, error: "The quote could not be read. Try a clearer photo." }, 422);
    return json({ ok: true, quote: clean(parsed) });
  }
};
