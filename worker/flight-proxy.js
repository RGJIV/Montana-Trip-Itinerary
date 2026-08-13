/**
 * Cloudflare Worker — FlightAware status proxy
 * Deploy: dash.cloudflare.com → Workers → Create → paste this file → Deploy
 * Then set WORKER_URL in index.html to your workers.dev URL.
 *
 * GET /?flight=DAL1146
 * GET /?flight=DAL406
 * Returns JSON with scheduled/estimated times, gate, status.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const flight = (url.searchParams.get('flight') || '').toUpperCase().replace(/\s+/g, '');

    if (!flight || !/^DAL\d+$|^DL\d+$/i.test(flight)) {
      return json({ error: 'Pass ?flight=DAL1146 or ?flight=DAL406' }, 400);
    }

    // Normalize DL#### → DAL#### for FlightAware
    const ident = flight.startsWith('DL') ? 'DAL' + flight.slice(2) : flight;

    try {
      const faUrl = `https://www.flightaware.com/live/flight/${ident}`;
      const res = await fetch(faUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; MontanaTripItinerary/1.0; personal travel tool)',
          Accept: 'text/html',
        },
      });

      if (!res.ok) {
        return json({ error: `FlightAware HTTP ${res.status}`, flight: ident }, 502);
      }

      const html = await res.text();
      const data = parseFlightAware(html, ident);
      return json(data);
    } catch (err) {
      return json({ error: String(err.message || err), flight: ident }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: CORS,
  });
}

function parseFlightAware(html, ident) {
  // FlightAware embeds a lot of status in the page text and occasional JSON blobs.
  // These patterns are best-effort and may need tweaks if FA changes layout.

  const out = {
    flight: ident,
    source: 'flightaware',
    fetchedAt: new Date().toISOString(),
    status: null,
    origin: null,
    destination: null,
    gateDep: null,
    gateArr: null,
    scheduledDep: null,
    estimatedDep: null,
    scheduledArr: null,
    estimatedArr: null,
    takeoff: null,
    landing: null,
    aircraft: null,
    rawSnippets: {},
  };

  // Status chips: On Time / Delayed / Cancelled / Arrived / etc.
  const statusMatch =
    html.match(/\b(On Time|Delayed|Cancelled|Canceled|Diverted|Arrived|En Route|Scheduled|Landed|Taxiing|Departed)\b/i) ||
    html.match(/class="[^"]*status[^"]*"[^>]*>\s*([^<]+)/i);
  if (statusMatch) out.status = clean(statusMatch[1] || statusMatch[0]);

  // Gate patterns
  const gateDep = html.match(/departing from\s*(?:<[^>]+>)*\s*\*?\*?Gate\s*([A-Z]?\d+[A-Z]?)\*?\*?/i)
    || html.match(/Gate\s*([A-Z]?\d+[A-Z]?)[^<]{0,40}depart/i);
  if (gateDep) out.gateDep = clean(gateDep[1]);

  const gateArr = html.match(/arriving at\s*(?:<[^>]+>)*\s*\*?\*?Gate\s*([A-Z]?\d+[A-Z]?)\*?\*?/i)
    || html.match(/Gate\s*([A-Z]?\d+[A-Z]?)[^<]{0,40}arriv/i);
  if (gateArr) out.gateArr = clean(gateArr[1]);

  // Time patterns — FlightAware often shows times like *06:55AM EDT* or 06:55AM
  const times = [...html.matchAll(/\*?(\d{1,2}:\d{2}\s*[AP]M)\s*([A-Z]{2,4})?\*?/gi)].map(
    (m) => clean(m[1] + (m[2] ? ' ' + m[2] : ''))
  );
  if (times.length >= 1) out.scheduledDep = times[0];
  if (times.length >= 2) out.estimatedArr = times[1];
  // Keep a few for debugging
  out.rawSnippets.timesFound = times.slice(0, 8);

  // More specific labeled times if present
  const labeled = (label) => {
    const re = new RegExp(label + '[^\d]{0,40}(\d{1,2}:\d{2}\s*[AP]M(?:\s*[A-Z]{2,4})?)', 'i');
    const m = html.match(re);
    return m ? clean(m[1]) : null;
  };
  out.scheduledDep = labeled('Scheduled') || labeled('Gate Departure') || out.scheduledDep;
  out.estimatedDep = labeled('Estimated') || labeled('Takeoff') || out.estimatedDep;
  out.scheduledArr = labeled('Scheduled') && times[1] ? times[1] : out.scheduledArr;
  out.estimatedArr = labeled('Gate Arrival') || labeled('Landing') || out.estimatedArr;
  out.takeoff = labeled('Takeoff') || out.takeoff;
  out.landing = labeled('Landing') || out.landing;

  // Aircraft
  const ac = html.match(/Boeing\s+[\d-]+[^<(]{0,20}|Airbus\s+A[\d-]+[^<(]{0,20}/i);
  if (ac) out.aircraft = clean(ac[0]);

  // Origin / destination city codes if present
  const route = html.match(/\b([A-Z]{3})\b[^A-Z]{0,30}\b([A-Z]{3})\b/);
  // Too noisy; skip unless clear GSP/ATL/BZN appear
  if (/\bGSP\b/.test(html) && /\bATL\b/.test(html)) {
    out.origin = 'GSP';
    out.destination = 'ATL';
  } else if (/\bATL\b/.test(html) && /\bBZN\b/.test(html)) {
    out.origin = 'ATL';
    out.destination = 'BZN';
  }

  return out;
}

function clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[*_]/g, '')
    .trim();
}
