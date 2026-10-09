import {createVapidKeys,validateSubscription,sendWebPush,validPushEndpoint} from './web-push.js';
const HOUR=3600,enc=new TextEncoder();
export const alertMetrics=[['visitors','VISITORS'],['actions','TOTAL ACTIONS'],['random_clicks','RANDOM CLICKS'],['save_clicks','SAVE CLICKS'],['exports','EXPORTS'],['uploads','UPLOADS'],['shares','GUESTBOOK POSTS'],['random_rate','RANDOM REACH'],['save_rate','SAVE REACH'],['export_rate','EXPORT REACH'],['clicks_per_user','RANDOM / USER']];
const actionNames="'random_click','save_click','upload_complete','setting_open','setting_change','guestbook_share','save_menu'";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
async function query(db,sql,...values){return (await db.batch([db.prepare(sql).bind(...values)]))[0];}
async function keys(db){let row=(await query(db,'SELECT * FROM push_config WHERE id=1')).results?.[0];if(!row){const k=await createVapidKeys();await query(db,'INSERT OR IGNORE INTO push_config (id,public_key,private_jwk) VALUES (1,?,?)',k.publicKey,JSON.stringify(k.privateJwk));row=(await query(db,'SELECT * FROM push_config WHERE id=1')).results[0];}return {publicKey:row.public_key,privateJwk:JSON.parse(row.private_jwk)};}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
export function risingMetrics(current,previous){return alertMetrics.filter(([key])=>current[key]>0&&(previous[key]===0||current[key]>=previous[key]*1.5)).map(([key,label])=>({key,label,current:current[key],previous:previous[key],ratio:previous[key]>0?current[key]/previous[key]:null}));}
export async function hourlyMetrics(db,start,end){
  const rows=await db.batch([
    db.prepare(`WITH active AS (SELECT visitor_id id FROM visits WHERE first_at>=? AND first_at<? AND visitor_id IS NOT NULL UNION SELECT v.visitor_id id FROM events e JOIN visits v USING(session_id) WHERE e.created_at>=? AND e.created_at<? AND v.visitor_id IS NOT NULL) SELECT COUNT(*) visitors FROM active`).bind(start,end,start,end),
    db.prepare(`SELECT SUM(name IN (${actionNames})) actions,SUM(name='random_click') random_clicks,SUM(name='save_click') save_clicks,SUM(name='file_created') exports,SUM(name='upload_complete') uploads,SUM(name='guestbook_share') shares,COUNT(DISTINCT CASE WHEN name='random_click' THEN v.visitor_id END) random_users,COUNT(DISTINCT CASE WHEN name='save_click' THEN v.visitor_id END) save_users,COUNT(DISTINCT CASE WHEN name='file_created' THEN v.visitor_id END) export_users FROM events e LEFT JOIN visits v USING(session_id) WHERE e.created_at>=? AND e.created_at<?`).bind(start,end)
  ]);
  const visitors=rows[0].results?.[0]?.visitors||0,r=rows[1].results?.[0]||{},out={visitors};
  for(const key of ['actions','random_clicks','save_clicks','exports','uploads','shares'])out[key]=Number(r[key]||0);
  for(const name of ['random','save','export'])out[name+'_rate']=visitors?Number(r[name+'_users']||0)/visitors*100:0;
  out.clicks_per_user=visitors?out.random_clicks/visitors:0;return out;
}
export async function compareHours(db,now=Math.floor(Date.now()/1000)){
  const end=Math.floor(now/HOUR)*HOUR,current=await hourlyMetrics(db,end-HOUR,end),previous=await hourlyMetrics(db,end-HOUR*2,end-HOUR);
  return {end,start:end-HOUR,previousStart:end-HOUR*2,current,previous,rising:risingMetrics(current,previous)};
}
function clock(second){return new Date(second*1000).toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});}
const value=(key,n)=>key.endsWith('_rate')?Number(n.toFixed(1))+'%':Number.isInteger(n)?String(n):n.toFixed(2);
export function notification(snapshot){const lines=snapshot.rising.map(m=>m.label+' '+value(m.key,m.previous)+' → '+value(m.key,m.current)+' '+(m.ratio===null?'[NEW]':'['+m.ratio.toFixed(2)+'×]'));return {title:'404 DREAMS / METRIC SURGE',body:clock(snapshot.start)+'–'+clock(snapshot.end)+' KST\n'+lines.join('\n'),tag:'dream-surge-'+snapshot.end,url:'/admin',snapshot};}
async function deliver(db,alert,subscriptions,send,now){
  const k=await keys(db);let sent=0,failed=0;
  for(const s of subscriptions){
    const claim=await query(db,`INSERT INTO push_deliveries (alert_id,subscription_id,state,attempts,updated_at) VALUES (?,?,'sending',1,?) ON CONFLICT(alert_id,subscription_id) DO UPDATE SET state='sending',attempts=attempts+1,updated_at=excluded.updated_at WHERE (push_deliveries.state='failed' OR (push_deliveries.state='sending' AND push_deliveries.updated_at<?)) AND push_deliveries.attempts<3`,alert.id,s.id,now,now-120);
    if(!claim.meta?.changes)continue;
    let result;try{result=await send({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},(({snapshot,...message})=>message)(JSON.parse(alert.payload)),k);}catch{result={ok:false,status:0};}
    await query(db,'UPDATE push_deliveries SET state=?,status=?,updated_at=? WHERE alert_id=? AND subscription_id=?',result.ok?'sent':'failed',result.status,now,alert.id,s.id);
    if(result.expired)await query(db,'DELETE FROM push_subscriptions WHERE id=?',s.id);
    if(result.ok)sent++;else failed++;
  }
  return {sent,failed};
}
export async function runPushAlerts(env,now=Math.floor(Date.now()/1000),send=sendWebPush){
  const db=env.DB;if(!db)return;
  const subs=(await query(db,'SELECT * FROM push_subscriptions LIMIT 10')).results||[];if(!subs.length)return {sent:0,failed:0};
  const snapshot=await compareHours(db,now);
  if(snapshot.rising.length)await query(db,"INSERT OR IGNORE INTO push_alerts (id,created_at,window_end,kind,payload) VALUES (?,?,?,'surge',?)",'hour:'+snapshot.end,now,snapshot.end,JSON.stringify(notification(snapshot)));
  // Retry temporary failures within the current hour, without sending successful deliveries twice.
  const alerts=(await query(db,"SELECT * FROM push_alerts WHERE kind='surge' AND window_end=?",snapshot.end)).results||[];let sent=0,failed=0;
  for(const alert of alerts){const r=await deliver(db,alert,subs,send,now);sent+=r.sent;failed+=r.failed;}
  await db.batch([db.prepare('DELETE FROM push_deliveries WHERE alert_id IN (SELECT id FROM push_alerts WHERE created_at<?)').bind(now-30*86400),db.prepare('DELETE FROM push_alerts WHERE created_at<?').bind(now-30*86400)]);
  return {sent,failed};
}
export async function pushRoute(request,env,send=sendWebPush){
  const db=env.DB,path=new URL(request.url).pathname,now=Math.floor(Date.now()/1000);
  if(path==='/api/admin/push'&&request.method==='GET'){
    const k=await keys(db),snapshot=await compareHours(db,now),rows=await db.batch([db.prepare('SELECT id,created_at FROM push_subscriptions').bind(),db.prepare(`SELECT a.id,a.created_at,a.kind,a.payload,SUM(d.state='sent') sent,SUM(d.state='failed') failed,SUM(d.state='sending') pending FROM push_alerts a LEFT JOIN push_deliveries d ON d.alert_id=a.id GROUP BY a.id ORDER BY a.created_at DESC LIMIT 20`).bind()]);
    return json({publicKey:k.publicKey,threshold:1.5,intervalMinutes:15,subscriptions:rows[0].results||[],snapshot,history:(rows[1].results||[]).map(x=>({...x,payload:JSON.parse(x.payload)}))});
  }
  if(request.method!=='POST')return json({error:'METHOD NOT ALLOWED'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'ORIGIN REJECTED'},403);
  let body;try{if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error();const text=await request.text();if(text.length>4096)throw Error();body=JSON.parse(text);}catch{return json({error:'INVALID REQUEST'},400);}
  if(path==='/api/admin/push/subscribe'){
    let sub;try{sub=await validateSubscription(body.subscription);}catch{return json({error:'INVALID PUSH SUBSCRIPTION'},400);}
    const id=await hash(sub.endpoint),rows=(await query(db,'SELECT COUNT(*) n FROM push_subscriptions WHERE id<>?',id)).results;
    if(rows[0].n>=10)return json({error:'DEVICE LIMIT REACHED'},409);
    await keys(db);await query(db,'INSERT INTO push_subscriptions (id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth',id,sub.endpoint,sub.keys.p256dh,sub.keys.auth,now);
    return json({ok:true,id});
  }
  if(!validPushEndpoint(body.endpoint))return json({error:'INVALID DEVICE'},400);
  const id=await hash(body.endpoint);
  if(path==='/api/admin/push/unsubscribe'){await query(db,'DELETE FROM push_subscriptions WHERE id=?',id);return json({ok:true});}
  if(path==='/api/admin/push/test'){
    const sub=(await query(db,'SELECT * FROM push_subscriptions WHERE id=?',id)).results?.[0];if(!sub)return json({error:'ENABLE PUSH FIRST'},404);
    const claim=await query(db,'UPDATE push_subscriptions SET last_test_at=? WHERE id=? AND last_test_at<=?',now,id,now-60);if(!claim.meta?.changes)return json({error:'WAIT 60 SECONDS BEFORE ANOTHER TEST'},429);
    const alert={id:'test:'+crypto.randomUUID(),payload:JSON.stringify({title:'404 DREAMS / PUSH CONNECTED',body:'METRIC ALERTS ACTIVE. 1.5× THE PREVIOUS HOUR. NO MINIMUM TRAFFIC.',tag:'dream-push-test',url:'/admin'})};
    await query(db,"INSERT INTO push_alerts (id,created_at,window_end,kind,payload) VALUES (?,?,?,'test',?)",alert.id,now,now,alert.payload);
    const result=await deliver(db,alert,[sub],send,now);return result.sent?json({ok:true}):json({error:'PUSH SERVICE DID NOT ACCEPT THE TEST. RETRY OR RECONNECT THIS DEVICE.'},502);
  }
  return json({error:'NOT FOUND'},404);
}
