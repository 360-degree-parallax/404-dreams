// Isolate-local, private cache. Call only after guardAdmin; never store in a public CDN.
const caches=new WeakMap();
export async function cachedStats(db,period,load,clock=()=>Date.now()){
  let cache=caches.get(db);if(!cache){cache=new Map();caches.set(db,cache);}
  const hit=cache.get(period);
  if(hit&&(hit.pending||hit.expires>clock()))return {value:await hit.promise,cacheHit:true};
  const entry={pending:true,expires:0,promise:null};
  entry.promise=Promise.resolve().then(load).then(value=>{entry.pending=false;entry.expires=clock()+60000;return value;}).catch(error=>{if(cache.get(period)===entry)cache.delete(period);throw error;});
  cache.set(period,entry);return {value:await entry.promise,cacheHit:false};
}
export function meteredDatabase(db){
  const usage={queries:0,rowsRead:0,rowsWritten:0};
  return {usage,db:{prepare:sql=>db.prepare(sql),async batch(statements){const results=await db.batch(statements);usage.queries+=statements.length;for(const r of results){usage.rowsRead+=Number(r.meta?.rows_read||0);usage.rowsWritten+=Number(r.meta?.rows_written||0);}return results;}}};
}
