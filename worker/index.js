import {usageRoute} from './cloudflare-usage.js';
import {cachedStats,meteredDatabase} from './stats-cache.js';
import {pushRoute,runPushAlerts} from './push-alerts.js';
import {dashboardStats,periodWindow} from './dashboard-stats.js';
import {guestbook,adminDeleteGuestPost} from './guestbook.js';
import {visitData,recordVisits} from './traffic.js';
import {guardAdmin,authRoute,endAdminSession} from './admin-auth.js';
// Access is restricted by this Site's existing owner-private dispatch policy.
// No image bytes, filenames, emails, or authenticated user details are recorded.
const names = new Set(['generated','random_click','save_menu','save_click','file_created','export_started','export_failed','upload_complete','setting_change','setting_open','guestbook_share']);
const uuid = /^[a-zA-Z0-9_-]{8,80}$/;
const response = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
const database = env => {if(!env.DB)throw new Error('Database unavailable');return env.DB;};
function clean(event) {
  if(!event||!names.has(event.name)||!uuid.test(event.id)||!uuid.test(event.sessionId)||!uuid.test(event.viewId))throw new Error('Invalid event');
  const text=(value,max)=>{if(typeof value!=='string'||value.length>max)throw new Error('Invalid text');return value;};
  const number=(value,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw new Error('Invalid value');return value;};
  if(!['DEMO','IMAGE','VIDEO'].includes(event.source)||!['','PNG','MP4','WEBM'].includes(event.format))throw new Error('Invalid source');
  if(!Array.isArray(event.colors)||event.colors.length!==3||event.colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Invalid colors');
  if(!Array.isArray(event.ratio)||event.ratio.length!==3||event.ratio.some(v=>!Number.isInteger(v)||v<0||v>100)||event.ratio.reduce((a,b)=>a+b,0)!==100)throw new Error('Invalid ratio');
  return [event.id,Math.floor(Date.now()/1000),event.name,event.sessionId,event.viewId,event.source,event.format,text(event.palette,100),JSON.stringify(event.colors),event.ratio.join(':'),text(event.comboKey,180),text(event.comboLabel,180),Math.floor(number(event.seed,1000000)),number(event.weight,2),number(event.detail,15.001),number(event.spark,100)];
}
async function collect(request,env){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return response({error:'Origin rejected'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'JSON required'},415);
  if(Number(request.headers.get('content-length'))>32768)return response({error:'Payload too large'},413);
  const raw=await request.text();if(raw.length>32768)return response({error:'Payload too large'},413);
  let rows,visits;try{const body=JSON.parse(raw);if(!Array.isArray(body.events)||!body.events.length||body.events.length>20)throw new Error();rows=body.events.map(clean);visits=[...new Map(body.events.map(e=>[e.sessionId,visitData(e,request)])).values()];}catch{return response({error:'Invalid event batch'},400);}
  const db=database(env);await recordVisits(db,visits);await db.batch(rows.map(row=>db.prepare('INSERT OR IGNORE INTO events (id,created_at,name,session_id,view_id,source,format,palette,colors,ratio,combo_key,combo_label,seed,weight,detail,spark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...row)));
  return response({accepted:rows.length});
}
async function visit(request,env){
  if(request.headers.get('origin')!==new URL(request.url).origin)return response({error:'Origin rejected'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'JSON required'},415);
  const raw=await request.text();if(raw.length>2048)return response({error:'Payload too large'},413);
  let data;try{data=visitData(JSON.parse(raw),request);}catch{return response({error:'Invalid visit'},400);}
  await recordVisits(database(env),[data]);return response({accepted:true});
}
async function stats(request,env){
  const days=new URL(request.url).searchParams.get('days')||'30';if(!['7','30','all'].includes(days))return response({error:'Invalid period'},400);
  const {value,cacheHit}=await cachedStats(database(env),days,async()=>{const meter=meteredDatabase(database(env)),data=await buildStats(meter.db,days);console.info('404 DREAMS D1 stats',JSON.stringify({period:days,...meter.usage}));return {...data,databaseUsage:meter.usage};});
  return response({...value,databaseUsage:{...value.databaseUsage,computedRowsRead:value.databaseUsage.rowsRead,rowsRead:cacheHit?0:value.databaseUsage.rowsRead,cacheHit,cacheSeconds:60}});
}
async function buildStats(db,days){
  const {since}=periodWindow(days);
  const cohort=`WITH generated AS (SELECT * FROM events WHERE name='generated' AND created_at>=?), saved AS (SELECT e.view_id,MAX(e.format='PNG') png,MAX(e.format='WEBM') webm,MAX(e.format='MP4') mp4 FROM (SELECT DISTINCT view_id FROM generated) g CROSS JOIN events e INDEXED BY idx_events_view_name WHERE e.view_id=g.view_id AND e.name='file_created' GROUP BY e.view_id)`;
  const queries=[
    db.prepare('SELECT COUNT(DISTINCT session_id) sessions, SUM(name=\'random_click\') random_clicks,SUM(name=\'save_click\') save_clicks,SUM(name=\'file_created\') files,SUM(name=\'file_created\' AND format=\'PNG\') png,SUM(name=\'file_created\' AND format=\'WEBM\') webm,SUM(name=\'file_created\' AND format=\'MP4\') mp4,SUM(name=\'export_failed\') failed,SUM(name=\'upload_complete\') uploads FROM events WHERE created_at>=?').bind(since),
    db.prepare(cohort+' SELECT COUNT(*) generated,COUNT(saved.view_id) saved FROM generated LEFT JOIN saved USING(view_id)').bind(since),
    db.prepare(cohort+' SELECT combo_key key,combo_label label,palette,ratio,weight,detail,spark,COUNT(*) generated,COUNT(saved.view_id) saved,SUM(COALESCE(png,0)) png,SUM(COALESCE(webm,0)) webm,SUM(COALESCE(mp4,0)) mp4 FROM generated LEFT JOIN saved USING(view_id) GROUP BY combo_key,palette,ratio,weight,detail,spark ORDER BY saved DESC,generated DESC LIMIT 50').bind(since),
    db.prepare(cohort+' SELECT palette label,colors,COUNT(*) generated,COUNT(saved.view_id) saved FROM generated LEFT JOIN saved USING(view_id) GROUP BY palette ORDER BY saved DESC,generated DESC LIMIT 50').bind(since),
    db.prepare('SELECT name,COUNT(*) count FROM events WHERE created_at>=? GROUP BY name ORDER BY count DESC').bind(since),
    db.prepare("SELECT AVG(weight) weight,AVG(detail) detail,AVG(spark) spark,COUNT(*) count FROM (SELECT view_id,weight,detail,spark FROM events WHERE name='file_created' AND created_at>=? GROUP BY view_id)").bind(since),
    db.prepare('SELECT created_at,name,source,format,palette,combo_label,seed,weight,detail,spark FROM events WHERE created_at>=? ORDER BY created_at DESC,rowid DESC LIMIT 30').bind(since),
    db.prepare('SELECT MIN(created_at) started FROM events').bind(),
  ];
  await recordVisits(db,[]);
  const activity="WITH activity AS (SELECT session_id,SUM(name='generated') generated,COUNT(DISTINCT CASE WHEN name='file_created' THEN view_id END) saved FROM events WHERE created_at>=? GROUP BY session_id) ";
  queries.push(
    db.prepare(activity+'SELECT v.channel,v.medium,v.campaign,v.content,COUNT(*) sessions,SUM(COALESCE(a.generated,0)) generated,SUM(COALESCE(a.saved,0)) saved FROM visits v LEFT JOIN activity a USING(session_id) WHERE v.first_at>=? GROUP BY v.channel,v.medium,v.campaign,v.content ORDER BY sessions DESC LIMIT 100').bind(since,since),
    db.prepare(activity+'SELECT v.*,COALESCE(a.generated,0) generated,COALESCE(a.saved,0) saved FROM visits v LEFT JOIN activity a USING(session_id) WHERE v.first_at>=? ORDER BY v.first_at DESC LIMIT 100').bind(since,since),
    db.prepare('SELECT COUNT(*) total FROM visits WHERE first_at>=?').bind(since)
  );
  const result=await db.batch(queries),rows=i=>result[i].results||[];
  const dashboard=await dashboardStats(db,days);
  return {dashboard,period:days,now:Date.now(),traffic:rows(8),visits:rows(9),visitCount:rows(10)[0]?.total||0,overview:{...rows(0)[0],...rows(1)[0]},combos:rows(2),palettes:rows(3),events:rows(4),settings:rows(5)[0],recent:rows(6),started:rows(7)[0]?.started||null};
}
export default {async scheduled(controller,env,ctx){ctx.waitUntil(runPushAlerts(env,Math.floor(controller.scheduledTime/1000)));},async fetch(request,env){
  const url=new URL(request.url);
  try{
    if(url.pathname==='/api/guestbook'||url.pathname.startsWith('/api/guestbook/'))return await guestbook(request,env);
    if(url.pathname==='/api/visit')return request.method==='POST'?await visit(request,env):response({error:'Method not allowed'},405);
    if(url.pathname==='/api/events')return request.method==='POST'?await collect(request,env):response({error:'Method not allowed'},405);
    if(['/api/admin/session','/api/admin/login','/api/admin/password','/api/admin/logout'].includes(url.pathname))return await authRoute(request,env,url.pathname);
    if(url.pathname==='/api/admin/guestbook'||/^\/api\/admin\/guestbook\/[0-9a-f-]{36}\/delete$/.test(url.pathname)){const denied=await guardAdmin(request,env);if(denied)return denied;if(url.pathname.endsWith('/delete'))return await adminDeleteGuestPost(request,env);if(request.method!=='GET')return response({error:'Method not allowed'},405);url.pathname='/api/guestbook';return await guestbook(new Request(url,request),env);}
    if(url.pathname==='/api/admin/d1-usage'){const denied=await guardAdmin(request,env);if(denied)return denied;return await usageRoute(request,env);}
    if(url.pathname==='/api/admin/stats'){const denied=await guardAdmin(request,env);if(denied)return denied;return request.method==='GET'?await stats(request,env):response({error:'Method not allowed'},405);}
    if(url.pathname==='/api/admin/push'||url.pathname.startsWith('/api/admin/push/')){const denied=await guardAdmin(request,env);if(denied)return denied;return await pushRoute(request,env);}
    if(url.pathname.startsWith('/api/'))return response({error:'Not found'},404);
    if(!['GET','HEAD'].includes(request.method))return response({error:'Method not allowed'},405);
    if(['/admin','/admin/','/admin.html'].includes(url.pathname)){
      const cleared=await endAdminSession(request,env);url.pathname='/admin.html';const asset=await env.ASSETS.fetch(new Request(url,request));const headers=new Headers(asset.headers);headers.set('set-cookie',cleared);headers.set('cache-control','private, no-store');return new Response(asset.body,{status:asset.status,headers});
    }
    if(url.pathname==='/')url.pathname='/index.html';
    return await env.ASSETS.fetch(new Request(url,request));
  }catch(error){
    console.error('404 DREAMS request failed',error);
    const message=String(error?.message||'');
    if(url.pathname.startsWith('/api/admin/')||['/admin','/admin/','/admin.html'].includes(url.pathname)){
      if(message==='Configure ADMIN_INITIAL_PASSWORD before first login')return response({code:'ADMIN_SECRET_REQUIRED',error:'ADMIN SECRET REQUIRED. SET ADMIN_INITIAL_PASSWORD TO AT LEAST 8 CHARACTERS IN WORKER SETTINGS, THEN DEPLOY.'},503);
      if(message==='Database unavailable')return response({code:'DATABASE_BINDING_REQUIRED',error:'DATABASE CONNECTION REQUIRED. CHECK THE DB BINDING IN WORKER SETTINGS.'},503);
      if(/no such table|no such column/i.test(message))return response({code:'DATABASE_MIGRATIONS_REQUIRED',error:'DATABASE SETUP REQUIRED. USE node scripts/deploy-cloudflare.mjs AS THE CLOUDFLARE DEPLOY COMMAND, THEN RETRY THE BUILD.'},503);
    }
    return response({code:'SERVER_ERROR',error:'Temporarily unavailable. Please retry.'},503);
  }
}};
