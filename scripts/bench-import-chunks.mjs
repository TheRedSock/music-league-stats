// Synthetic CPU-only comparison. Reads the original helper; does not upload data.
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { makeChunks as grouped } from '../src/lib/import-client';
const { transformSync }=await import('esbuild');
const source="const maximumChunkRows = 500;\nconst targetRequestBytes = 900 * 1024;\nconst encoder = new TextEncoder();\n\nexport async function sha256Json(value: unknown): Promise<string> {\n  const digest = await crypto.subtle.digest(\n    \"SHA-256\",\n    encoder.encode(JSON.stringify(value)),\n  );\n  return [...new Uint8Array(digest)]\n    .map((byte) => byte.toString(16).padStart(2, \"0\"))\n    .join(\"\");\n}\n\nfunction estimatedRequestSize(\n  kind: ImportKind,\n  index: number,\n  startRow: number,\n  rows: unknown[],\n): number {\n  return encoder.encode(\n    JSON.stringify({\n      kind,\n      index,\n      startRow,\n      rows,\n      hash: \"0\".repeat(64),\n    }),\n  ).byteLength;\n}\n\nasync function makeChunks(\n  kind: ImportKind,\n  rows: unknown[],\n): Promise<UploadChunk[]> {\n  const groups: Array<{ startRow: number; rows: unknown[] }> = [];\n  let current: unknown[] = [];\n  let startRow = 0;\n\n  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {\n    const next = [...current, rows[rowIndex]];\n    const tooLarge =\n      estimatedRequestSize(kind, groups.length, startRow, next) >\n      targetRequestBytes;\n    if (current.length > 0 && (current.length >= maximumChunkRows || tooLarge)) {\n      groups.push({ startRow, rows: current });\n      current = [rows[rowIndex]];\n      startRow = rowIndex;\n    } else {\n      current = next;\n    }\n    if (\n      current.length === 1 &&\n      estimatedRequestSize(kind, groups.length, startRow, current) >\n        targetRequestBytes\n    ) {\n      throw new Error(\n        `${kind}.csv row ${rowIndex + 2} is too large to upload safely.`,\n      );\n    }\n  }\n  if (current.length > 0) groups.push({ startRow, rows: current });\n\n  return Promise.all(\n    groups.map(async (group, index) => ({\n      kind,\n      index,\n      startRow: group.startRow,\n      rows: group.rows,\n      hash: await sha256Json(group.rows),\n    })),\n  );\n}\n\n\nexport { makeChunks };";
const js=transformSync(source,{loader:'ts',format:'esm',target:'es2022'}).code;
const {makeChunks:original}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const row=i=>({spotifyUri:'spotify:track:0123456789ABCDEFGHIJKL',voterId:'00000000-0000-4000-8000-000000000001',created:'2026-10-01T12:00:00Z',points:i%6,comment:'Björk — great pick! 🎵\nAnother line.',roundId:'00000000-0000-4000-8000-000000000002'});
const results=[];
for(const count of [5000,25000]){
  const rows=Array.from({length:count},(_,i)=>row(i));
  const samples=[];let baseline;
  for(const [name,fn] of [['original',original],['incremental',grouped]]){
    const times=[];
    for(let i=0;i<3;i++){
      const t=performance.now();const chunks=await fn('votes',rows);times.push(Math.round(performance.now()-t));
      const serial=JSON.stringify(chunks);if(!baseline)baseline=serial;if(baseline!==serial)throw new Error('Chunk mismatch');
    }
    samples.push({name,ms:times});
  }
  results.push({rows:count,samples});console.log(JSON.stringify(results.at(-1)));
}
const large=Array.from({length:100},(_,i)=>({...row(i),comment:'🎵'.repeat(5000)}));
if(JSON.stringify(await original('votes',large))!==JSON.stringify(await grouped('votes',large)))throw new Error('Byte-boundary mismatch');
for(const fn of [original,grouped]){
  let rejected=false;try{await fn('votes',[{comment:'x'.repeat(930000)}]);}catch{rejected=true;}if(!rejected)throw new Error('Oversize accepted');
}
await writeFile('docs/delivery-evidence/stage-5-chunking.json',JSON.stringify({measuredAt:new Date().toISOString(),note:'Synthetic canonical-shaped rows; Node CPU benchmark, not browser or end-to-end import timing. Exact chunk boundaries and hashes checked, including Unicode, byte-limit chunks, and oversize-row rejection.',results},null,2));
