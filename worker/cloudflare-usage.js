import {cachedStats} from './stats-cache.js';
const accountDefault='fac206f988289f0552132bb88c8ef790',databaseDefault='dcf6bb51-db96-4cbd-8c36-c4255856f0b1';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
export function queryCategory(query){
  const s=String(query).replace(/\s+/g,' ').toLowerCase();
  if(/\b(sqlite_master|pragma|d1_migrations|_cf_)\b/.test(s)||/^\s*(create|alter|drop|reindex)\b/.test(s)||/update visits set ip\s*=\s*null/.test(s))return 'MAINTENANCE';
  if(/\bpush_(alerts|deliveries|config|subscriptions)\b/.test(s))return 'PUSH';
  if(/\badmin_(credentials|sessions)\b/.test(s))return 'AUTH';
  if(/\bguestbook(_likes)?\b/.test(s)||/from events where session_id\s*=.+view_id\s*=.+name\s*=\s*'generated'.+limit 1/.test(s))return 'GUESTBOOK';
  if(/^\s*(insert|update|delete)\b/.test(s)&&/\b(events|visits|visitors|visitor_days)\b/.test(s))return 'COLLECTION';
  if(/created_at\s*>=.+created_at\s*</.test(s)||/first_at\s*>=.+first_at\s*</.test(s))return 'PUSH';
  if(/\b(events|visits|visitors|visitor_days)\b/.test(s))return 'STATS';
  return 'OTHER';
}
export function summarizeUsage(account,start,end){
  const analytics=account.d1AnalyticsAdaptiveGroups||[],queries=account.d1QueriesAdaptiveGroups||[];
  const totalRead=analytics.reduce((n,r)=>n+Number(r.sum?.rowsRead||0),0),totalWrite=analytics.reduce((n,r)=>n+Number(r.sum?.rowsWritten||0),0);
  const groups=new Map(),top=[];let coveredRead=0;
  for(const row of queries){const query=String(row.dimensions?.query||''),reads=Number(row.sum?.rowsRead||0),writes=Number(row.sum?.rowsWritten||0),calls=Number(row.count||0),category=queryCategory(query);coveredRead+=reads;const g=groups.get(category)||{category,reads:0,writes:0,calls:0};g.reads+=reads;g.writes+=writes;g.calls+=calls;groups.set(category,g);top.push({query,reads,writes,calls,category});}
  const missing=Math.max(0,totalRead-coveredRead);if(missing)groups.set('UNATTRIBUTED',{category:'UNATTRIBUTED',reads:missing,writes:0,calls:null});
  return {start,end,totalRead,totalWrite,coveredRead,coverage:totalRead?Math.min(100,coveredRead/totalRead*100):null,limit:5000000,percent:totalRead/5000000*100,queryLimitReached:queries.length>=1000,classification:'INFERRED FROM SQL. SHARED QUERIES CAN SPAN MULTIPLE REQUESTS.',groups:[...groups.values()].map(g=>({...g,share:totalRead?g.reads/totalRead*100:null})).sort((a,b)=>b.reads-a.reads),top:top.sort((a,b)=>b.reads-a.reads).slice(0,30),updatedAt:Date.now()};
}
export async function fetchCloudflareUsage(env,fetcher=fetch,now=new Date()){
  const token=env.CF_ANALYTICS_TOKEN;if(!token)throw Object.assign(new Error('ADD CF_ANALYTICS_TOKEN AS A WORKER SECRET. ACCOUNT ANALYTICS / READ.'),{status:503,code:'ANALYTICS_TOKEN_REQUIRED'});
  const account=env.CF_ACCOUNT_ID||accountDefault,database=env.CF_D1_DATABASE_ID||databaseDefault,date=now.toISOString().slice(0,10),start=date+'T00:00:00.000Z',end=now.toISOString();
  if(!/^[a-f0-9]{32}$/i.test(account)||!/^[a-f0-9-]{36}$/i.test(database))throw Object.assign(new Error('CHECK THE CLOUDFLARE ACCOUNT / DATABASE ID.'),{status:503});
  // Query Insights request follows Cloudflare's Wrangler d1/insights.ts. Analytics uses UTC billing dates.
  const query=`query DreamD1Usage($accountTag: string, $filter: ZoneWorkersRequestsFilter_InputObject) { viewer { accounts(filter: {accountTag: $accountTag}) { d1QueriesAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [sum_rowsRead_DESC]) { sum { rowsRead rowsWritten } count dimensions { query } } d1AnalyticsAdaptiveGroups(limit: 100, filter: {date_geq: "${date}", date_leq: "${date}", databaseId: "${database}"}) { sum { rowsRead rowsWritten } } } } }`;
  let result;try{const res=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:account,filter:{AND:[{datetimeHour_geq:start,datetimeHour_leq:end,databaseId:database}]}}})});if(!res.ok)throw Error();result=await res.json();}catch{throw Object.assign(new Error('CLOUDFLARE ANALYTICS REQUEST FAILED. CHECK THE TOKEN AND RETRY.'),{status:502});}
  if(result.errors?.length||!result.data?.viewer?.accounts?.[0])throw Object.assign(new Error('ANALYTICS ACCESS FAILED. CHECK ACCOUNT ANALYTICS / READ, ACCOUNT SCOPE AND TOKEN EXPIRY.'),{status:502});
  return summarizeUsage(result.data.viewer.accounts[0],start,end);
}
export async function usageRoute(request,env){
  if(request.method!=='GET')return json({error:'METHOD NOT ALLOWED'},405);
  try{const {value,cacheHit}=await cachedStats(env.DB,'cloudflare-usage',()=>fetchCloudflareUsage(env));return json({...value,cacheHit});}catch(e){return json({error:e.message,code:e.code||'ANALYTICS_UNAVAILABLE'},e.status||502);}
}
