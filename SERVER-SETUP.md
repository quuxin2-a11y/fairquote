# Set up the quote reader (about 10 minutes, from a phone)

FairQuote reads photos through a small server you control. This keeps the AI key out of the app.
It runs on Cloudflare Workers, which has a free plan (100,000 requests a day).

You need: a free Cloudflare account and an API key from your AI provider (Anthropic).

1. In Chrome, open **dash.cloudflare.com** and sign in or create a free account.
2. Tap **Workers & Pages** → **Create** → **Create Worker**. Name it `fairquote-reader`. Tap **Deploy**.
3. Tap **Edit code**. Select everything in the editor and delete it.
4. Open `worker.js` from this project, copy all of it, and paste it into the editor. Tap **Deploy**.
5. Go back to the Worker → **Settings** → **Variables and Secrets** → **Add**.
   - Type **Secret**, name `ANTHROPIC_API_KEY`, value: your API key.
   - Type **Secret**, name `APP_TOKEN`, value: a long random code you make up (20+ characters). This is the access code.
6. Tap **Deploy** again. Your server address is shown on the Worker page, like
   `https://fairquote-reader.yourname.workers.dev`.
7. In the FairQuote app: **Settings** → paste the server address and the access code → **Save settings**.
8. Check it: open the server address in Chrome. You should see `{"ok":true,"service":"fairquote-reader"}`.

## Turn on in-app how-to videos (optional, free)
The DIY sections can play how-to videos inside the app. This needs a free YouTube Data API key.
1. In Chrome, open **console.cloud.google.com**, create a project, then **APIs & Services** → **Library** → search **YouTube Data API v3** → **Enable**.
2. **Credentials** → **Create credentials** → **API key**. Copy it.
3. In Cloudflare, open your Worker → **Settings** → **Variables and Secrets** → **Add**. Type **Secret**, name `YOUTUBE_API_KEY`, value: the key. Tap **Deploy**.
4. Replace the Worker code with the new `worker.js` from this project and tap **Deploy**.
Each new search uses part of Google's free daily quota. Results are saved for a week, so common repairs cost one search for everyone. Without a key the app shows a "Search on YouTube" link instead.

## Turn on the in-app shop map (optional, free)
Without this, the shop map still works but uses Google's basic embedded map. With a key it uses Google's official Maps Embed API, which is free with no usage limit.
1. In the same Google Cloud project, **Library** → **Maps Embed API** → **Enable**.
2. **Credentials** → **Create credentials** → **API key**. Under **API restrictions** choose **Maps Embed API** only, then save.
3. In Cloudflare, add a variable (plain text is fine) named `MAPS_EMBED_KEY` with that key and tap **Deploy**.

## Cost
Each photo read costs a few cents of AI usage, billed by your AI provider, not by this app.
Set a monthly spend limit in your AI provider's console before sharing the app with others.

## Keep it safe
- Never put the API key in the app or in this repository. It belongs only in Cloudflare secrets.
- The access code stops strangers from using your server. Change it any time (Settings in Cloudflare, then in the app).
- Before real users: add per-user limits and sign-in. The built-in hourly cap is only a guard against loops.
