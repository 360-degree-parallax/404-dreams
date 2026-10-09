const validId=/^[a-zA-Z0-9_-]{8,80}$/;
const field=v=>typeof v==='string'?v.replace(/[\x00-\x1f]/g,'').slice(0,120):'';
export function visitData(body,request){
  if(!validId.test(body?.sessionId))throw new Error('Invalid session');
  const a=body.attribution||{},source=field(a.source).toLowerCase(),medium=field(a.medium).toLowerCase();
  let referrer='';try{referrer=new URL(a.referrer).hostname.toLowerCase();}catch{}
  if(referrer===new URL(request.url).hostname.toLowerCase())referrer='';
  const instagram=/(^|\.)instagram\.com$/.test(referrer),inApp=/Instagram/i.test(request.headers.get('user-agent')||'');
  let channel=source||referrer||'direct_unknown',evidence=source?'utm':referrer?'referrer':'unknown';
  if(['ig','instagram','instagram.com'].includes(source)){channel='instagram';}
  else if(!source&&instagram){channel='instagram';}
  else if(!source&&!referrer&&inApp){channel='instagram_in_app';evidence='user_agent';}
  // Use the edge-provided address only; never accept a body or X-Forwarded-For IP.
  const raw=request.headers.get('cf-connecting-ip')||'';
  const ip=raw.length<=45&&/^[0-9a-f:.]+$/i.test(raw)?raw:null;
  return [body.sessionId,Math.floor(Date.now()/1000),ip,channel,medium,field(a.campaign),field(a.content),referrer,evidence];
}
export async function recordVisits(db,visits){
  const now=Math.floor(Date.now()/1000);
  await db.batch([
    db.prepare('UPDATE visits SET ip=NULL WHERE ip IS NOT NULL AND first_at<?').bind(now-30*86400),
    ...visits.map(v=>db.prepare('INSERT INTO visits (session_id,first_at,last_at,ip,channel,medium,campaign,content,referrer,evidence) VALUES (?,?,?, ?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET last_at=MAX(last_at,excluded.last_at)').bind(v[0],v[1],v[1],...v.slice(2)))
  ]);
}
