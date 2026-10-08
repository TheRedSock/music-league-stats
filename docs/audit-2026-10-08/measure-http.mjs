// Production-mode localhost HTML response timings. No mutations or admin requests.
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const routes = ['/', '/songs', '/players', '/players/theredsock?league=all', '/facts', '/relationships', '/relationships/graphs?view=bubbles', '/relationships/graphs?view=progression', '/faq'];
const results = [];
for (const path of routes) {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const start = performance.now();
    const response = await fetch('http://127.0.0.1:3001' + path);
    const headersMs = performance.now() - start;
    const html = await response.text();
    samples.push({ status: response.status, headersMs: Math.round(headersMs), completeMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(html), gzipBytes: gzipSync(html).byteLength, flightScripts: (html.match(/self\.__next_f\.push/g)||[]).length });
  }
  const result = { path, samples };
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile('docs/audit-2026-10-08/http-measurements.json',JSON.stringify({ measuredAt: new Date().toISOString(), note:'Next production build, localhost, no network throttling. First request then three warm requests. Complete HTML stream time, not LCP; compressed sizes are calculated gzip, not a browser transfer measurement.',results },null,2));
