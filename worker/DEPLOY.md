# Deploy the flight-status proxy (≈2 minutes)

The itinerary page can call a small Cloudflare Worker that reads FlightAware and returns JSON. When live data differs from the printed schedule, a yellow caution banner appears.

## Steps

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it e.g. `montana-flight-proxy`.
3. Replace the default code with the contents of `flight-proxy.js` in this folder.
4. Click **Deploy**.
5. Copy the worker URL (looks like `https://montana-flight-proxy.<your-subdomain>.workers.dev`).
6. Open `index.html` in this repo and set:

```js
var WORKER_URL = 'https://montana-flight-proxy.<your-subdomain>.workers.dev';
```

7. Commit and push. The **Check live flight status** button will then fetch live data instead of only opening tabs.

## Test

```
https://montana-flight-proxy.<your-subdomain>.workers.dev/?flight=DAL1146
https://montana-flight-proxy.<your-subdomain>.workers.dev/?flight=DAL406
```

You should see JSON with status, gates, and times.

## Notes

- Free Cloudflare Workers tier is enough for personal trip use.
- Parsing is best-effort against FlightAware HTML; if FA changes layout, the worker may need a small tweak.
- Without `WORKER_URL` set, the button still opens FlightAware tabs (previous behavior).
