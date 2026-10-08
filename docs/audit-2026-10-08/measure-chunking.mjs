// Synthetic CPU-only comparison. Reads the original helper; does not upload data.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const source=await readFile('src/lib/import-client.ts','utf8');
const extracted=source.slice(source.indexOf('const maximumChunkRows'),source.indexOf('export function parseImportFile'))+'\nexport { makeChunks };';
const { transformSync }=await import('esbuild');
const js=transformSync(extracted,{loader:'ts',format:'esm',target:'es2022'}).code;
const {makeChunks:original}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const encoder=new TextEncoder();
async function grouped(kind,rows){
  const chunks=[];
  let current=[],startRow=0,rowBytes=0;
  const envelope=()=>encoder.encode(JSON.stringify({kind,index:chunks.length,startRow,rows:[],hash:'0'.repeat(64)})).byteLength;
  const flush=()=>{chunks.push({kind,index:chunks.length,startRow,rows:current});current=[];rowBytes=0;};
  for(let i=0;i<rows.length;i++){
    const bytes=encoder.encode(JSON.stringify(rows[i])).byteLength;
    if(current.length && (current.length>=500 || envelope()+rowBytes+bytes+current.length>900*1024)){flush();startRow=i;}
    if(!current.length && envelope()+bytes>900*1024)throw new Error('Oversize row');
    current.push(rows[i]);rowBytes+=bytes;
  }
  if(current.length)flush();
  return Promise.all(chunks.map(async chunk=>({...chunk,hash:Buffer.from(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(chunk.rows)))).toString('hex')})));
}
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
await writeFile('docs/audit-2026-10-08/chunking-comparison.json',JSON.stringify({measuredAt:new Date().toISOString(),note:'Synthetic canonical-shaped rows; Node CPU benchmark, not browser or end-to-end import timing. Exact chunk boundaries and hashes checked, including Unicode, byte-limit chunks, and oversize-row rejection.',results},null,2));
