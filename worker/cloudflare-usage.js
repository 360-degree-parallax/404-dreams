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
  return {start,end,totalRead,totalWrite,coveredRead,coverage:totalRead?Math.min(100,coveredRead/totalRead*100):null,limit:5000000,percent:totalRead/5000000*100,queryLimitReached:queries.length>=100,classification:'INFERRED FROM SQL. SHARED QUERIES CAN SPAN MULTIPLE REQUESTS.',groups:[...groups.values()].map(g=>({...g,share:totalRead?g.reads/totalRead*100:null})).sort((a,b)=>b.reads-a.reads),top:top.sort((a,b)=>b.reads-a.reads).slice(0,30),updatedAt:Date.now()};
}
function safeDetail(value,token){
  return String(value||'UNKNOWN ERROR').split(token).join('[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/[\r\n\t]+/g,' ').slice(0,500);
}
function upstreamError(messages,token,status=200){
  const detail=safeDetail(messages||'EMPTY ANALYTICS RESPONSE',token);
  const auth=status===401||status===403||/auth|permission|access denied|token|not authorized/i.test(detail);
  const code=auth?'ANALYTICS_PERMISSION':status===429?'ANALYTICS_RATE_LIMIT':'ANALYTICS_API_ERROR';
  const hint=auth?'CHECK ACCOUNT ANALYTICS / READ AND ACCOUNT SCOPE. ':'';
  return Object.assign(new Error(code+': '+hint+detail),{status:502,code});
}
export async function fetchCloudflareUsage(env,fetcher=fetch,now=new Date()){
  const token=String(env.CF_ANALYTICS_TOKEN||'').trim().replace(/^Bearer\s+/i,'');
  if(!token)throw Object.assign(new Error('ADD CF_ANALYTICS_TOKEN AS A WORKER SECRET. ACCOUNT ANALYTICS / READ.'),{status:503,code:'ANALYTICS_TOKEN_REQUIRED'});
  if(!/^[\x21-\x7e]+$/.test(token))throw Object.assign(new Error('ANALYTICS_TOKEN_FORMAT: SECRET MUST CONTAIN ONLY THE API TOKEN, WITHOUT SPACES, LINE BREAKS OR CURL COMMANDS.'),{status:503,code:'ANALYTICS_TOKEN_FORMAT'});
  const account=env.CF_ACCOUNT_ID||accountDefault,database=env.CF_D1_DATABASE_ID||databaseDefault,date=now.toISOString().slice(0,10),start=date+'T00:00:00Z',end=now.toISOString().replace(/\.\d{3}Z$/,'Z');
  if(!/^[a-f0-9]{32}$/i.test(account)||!/^[a-f0-9-]{36}$/i.test(database))throw Object.assign(new Error('CHECK THE CLOUDFLARE ACCOUNT / DATABASE ID.'),{status:503});
  // Inline filters let each dataset use its own GraphQL input type.
  // Keep totals independent: an Insights error must not hide valid daily usage.
  const envelope=selection=>`query DreamD1Usage { viewer { accounts(filter: {accountTag: "${account}"}) { ${selection} } } }`;
  const totals=envelope(`d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: "${date}", date_leq: "${date}", databaseId: "${database}"}) { sum { rowsRead rowsWritten } }`);
  const insights=envelope(`d1QueriesAdaptiveGroups(limit: 100, filter: {AND: [{datetimeHour_geq: "${start}", datetimeHour_leq: "${end}", databaseId: "${database}"}]}, orderBy: [sum_rowsRead_DESC]) { sum { rowsRead rowsWritten } count dimensions { query } }`);
  async function request(query,dataset){
    let res,text;
    const signal=AbortSignal.timeout(30000);
    try{
      res=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'manual',signal,headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({query})});
    }catch(e){
      const timeout=signal.aborted||e?.name==='TimeoutError'||e?.name==='AbortError';
      const code=timeout?'ANALYTICS_TIMEOUT':'ANALYTICS_NETWORK_ERROR';
      const detail=timeout?'CLOUDFLARE DID NOT RESPOND WITHIN 30 SECONDS.':safeDetail((e?.name||'FETCH ERROR')+': '+(e?.message||'REQUEST FAILED'),token);
      throw Object.assign(new Error(code+': '+detail),{status:502,code});
    }
    if(res.status>=300&&res.status<400)throw Object.assign(new Error('ANALYTICS_REDIRECT: HTTP '+res.status+' / REDIRECT REFUSED.'),{status:502,code:'ANALYTICS_REDIRECT'});
    try{text=await res.text();}catch(e){
      const code=signal.aborted?'ANALYTICS_TIMEOUT':'ANALYTICS_BODY_ERROR';
      throw Object.assign(new Error(code+': HTTP '+res.status+' / '+safeDetail(e?.message||'RESPONSE BODY UNAVAILABLE',token)),{status:502,code});
    }
    let result;
    try{result=JSON.parse(text);}catch{
      // Never return an HTML error page or arbitrary response body to the client.
      if(!res.ok)throw upstreamError('HTTP '+res.status+' / NON-JSON RESPONSE / '+safeDetail(res.headers.get('content-type')||'UNKNOWN CONTENT TYPE',token),token,res.status);
      throw Object.assign(new Error('ANALYTICS_RESPONSE_FORMAT: HTTP '+res.status+' / EXPECTED JSON, RECEIVED '+safeDetail(res.headers.get('content-type')||'UNKNOWN CONTENT TYPE',token)),{status:502,code:'ANALYTICS_RESPONSE_FORMAT'});
    }
    if(!result||typeof result!=='object')throw upstreamError('INVALID JSON RESPONSE: HTTP '+res.status,token,res.status);
    const errors=result.errors||[];
    if(!res.ok||errors.length)throw upstreamError(errors.map(e=>e.message||e.code||'UPSTREAM ERROR').join(' / ')||'HTTP '+res.status,token,res.status);
    const rows=result.data?.viewer?.accounts?.[0]?.[dataset];
    if(!Array.isArray(rows))throw upstreamError('ACCOUNT OR DATASET NOT AVAILABLE: '+dataset,token);
    return rows;
  }
  const [totalResult,queryResult]=await Promise.allSettled([request(totals,'d1AnalyticsAdaptiveGroups'),request(insights,'d1QueriesAdaptiveGroups')]);
  if(totalResult.status==='rejected')throw totalResult.reason;
  const warnings=queryResult.status==='rejected'?[queryResult.reason.message]:[];
  const report=summarizeUsage({d1AnalyticsAdaptiveGroups:totalResult.value,d1QueriesAdaptiveGroups:queryResult.status==='fulfilled'?queryResult.value:[]},start,end);
  return {...report,insightsAvailable:queryResult.status==='fulfilled',warnings};
}
export async function usageRoute(request,env){
  if(request.method!=='GET')return json({error:'METHOD NOT ALLOWED'},405);
  try{const {value,cacheHit}=await cachedStats(env.DB,'cloudflare-usage',()=>fetchCloudflareUsage(env));return json({...value,cacheHit});}catch(e){return json({error:e.message,code:e.code||'ANALYTICS_UNAVAILABLE'},e.status||502);}
}
