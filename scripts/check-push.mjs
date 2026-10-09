import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createPublicKey,verify,hkdfSync} from 'node:crypto';
import {base64url,unbase64url,createVapidKeys,encryptPush,vapidAuthorization,validPushEndpoint,validateSubscription,sendWebPush} from '../worker/web-push.js';
import {hourlyMetrics,compareHours,risingMetrics,runPushAlerts,pushRoute} from '../worker/push-alerts.js';
import worker from '../worker/index.js';
import {hashPassword} from '../worker/admin-auth.js';
const sqlite=new DatabaseSync(':memory:');for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(await readFile('drizzle/'+file,'utf8'));
const DB={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;}}},async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>{const q=sqlite.prepare(s.sql);return /^\s*(SELECT|WITH)/i.test(s.sql)?{results:q.all(...s.values)}:{results:[],meta:q.run(...s.values)};});sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const env={DB},now=Math.floor(Date.now()/1000),end=Math.floor(now/3600)*3600,start=end-3600,previousStart=end-7200;
function session(id,visitor,time){sqlite.prepare("INSERT INTO visits(session_id,first_at,last_at,channel,medium,campaign,content,referrer,evidence,visitor_id) VALUES (?,?,?,'direct_unknown','','','','','unknown',?)").run(id,time,time,visitor);}
function event(id,name,time){sqlite.prepare("INSERT INTO events VALUES (?,?,?,?,?,'IMAGE','','TEST','[]','50:35:15','TEST','TEST',1,1,9,0)").run(crypto.randomUUID(),time,name,id,crypto.randomUUID());}
session('BEFORE_A','A',previousStart+1);session('NOW_A','A',start+1);session('NOW_B','B',start+2);session('NOW_B_2','B',start+3);
for(let i=0;i<2;i++)event('BEFORE_A','random_click',previousStart+10+i);
for(let i=0;i<3;i++)event('NOW_A','random_click',start+10+i);
event('NOW_B','save_click',start+20);event('NOW_B','file_created',start+21);event('NOW_B','generated',start+22);event('NOW_B','export_started',start+23);
// A continuing session's activity counts in the hour, without counting a new visit.
session('LONG_SESSION','C',previousStart-500);event('LONG_SESSION','setting_change',start+30);
// Exact upper boundary is excluded, and consecutive hour boundaries never overlap.
event('NOW_A','random_click',end);
const current=await hourlyMetrics(DB,start,end);assert.equal(current.visitors,3);assert.equal(current.random_clicks,3);assert.equal(current.actions,5);assert.equal(current.exports,1);assert(Math.abs(current.random_rate-100/3)<1e-10);assert(Math.abs(current.save_rate-100/3)<1e-10);assert.equal(current.clicks_per_user,1);
const compare=await compareHours(DB,end+60);assert.equal(compare.previous.random_clicks,2);assert(compare.rising.some(x=>x.key==='random_clicks'&&x.ratio===1.5));
assert.equal(risingMetrics({visitors:3},{visitors:2})[0].ratio,1.5);assert.equal(risingMetrics({visitors:2.99},{visitors:2}).length,0);assert.equal(risingMetrics({visitors:0},{visitors:0}).length,0);assert.equal(risingMetrics({visitors:1},{visitors:0})[0].ratio,null);
const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);const raw=new Uint8Array(await crypto.subtle.exportKey('raw',receiver.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16));
const subscription={endpoint:'https://web.push.apple.com/test-subscription',keys:{p256dh:base64url(raw),auth:base64url(auth)}};await validateSubscription(subscription);
for(const endpoint of ['https://127.0.0.1/a','https://evil.example/a','http://web.push.apple.com/a','https://web.push.apple.com.evil.example/a','https://user:pass@web.push.apple.com/a','https://web.push.apple.com:8443/a'])assert.equal(validPushEndpoint(endpoint),false);
for(const endpoint of ['https://web.push.apple.com/a','https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a'])assert.equal(validPushEndpoint(endpoint),true);
await assert.rejects(validateSubscription({...subscription,keys:{...subscription.keys,auth:'AA'}}));
// Independently derive recipient keys with Node's hkdfSync, then decrypt the wire format.
const payload={title:'404 DREAMS',body:'RANDOM 2 → 3 [1.50×]'},body=await encryptPush(subscription,payload);assert.equal(new DataView(body.buffer,body.byteOffset).getUint32(16),4096);assert.equal(body[20],65);
const sender=body.slice(21,86),peer=await crypto.subtle.importKey('raw',sender,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=await crypto.subtle.deriveBits({name:'ECDH',public:peer},receiver.privateKey,256);
const info=Buffer.concat([Buffer.from('WebPush: info\0'),raw,sender]),ikm=hkdfSync('sha256',Buffer.from(shared),auth,info,32),salt=body.slice(0,16);
const cek=hkdfSync('sha256',Buffer.from(ikm),salt,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=hkdfSync('sha256',Buffer.from(ikm),salt,Buffer.from('Content-Encoding: nonce\0'),12);
const aes=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},aes,body.slice(86)));assert.equal(plain.at(-1),2);assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.slice(0,-1))),payload);
const keys=await createVapidKeys(),authorization=await vapidAuthorization(subscription.endpoint,keys,now),token=authorization.match(/t=([^,]+)/)[1],parts=token.split('.'),claims=JSON.parse(new TextDecoder().decode(unbase64url(parts[1])));
assert.equal(claims.aud,'https://web.push.apple.com');assert.equal(claims.exp,now+43200);assert.equal(claims.sub,'https://404dreams.xyz/');const pub={...keys.privateJwk};delete pub.d;
assert(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:createPublicKey({key:pub,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(unbase64url(parts[2]))));
let wire;assert((await sendWebPush(subscription,payload,keys,async(url,options)=>{wire={url,options};return new Response(null,{status:201});})).ok);assert.equal(wire.options.headers['content-encoding'],'aes128gcm');assert.equal(wire.options.redirect,'error');
const req=(path,data,origin='https://404dreams.xyz')=>new Request('https://404dreams.xyz/api/admin/push'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
assert.equal((await worker.fetch(new Request('https://404dreams.xyz/api/admin/push'),env)).status,401);assert.equal((await worker.fetch(req('/subscribe',{subscription}),env)).status,401);
assert.equal((await pushRoute(req('/subscribe',{subscription},'https://evil.example'),env)).status,403);
assert.equal((await pushRoute(req('/subscribe',{subscription}),env)).status,200);assert.equal((await pushRoute(req('/subscribe',{subscription}),env)).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,1);
const status=await (await pushRoute(new Request('https://404dreams.xyz/api/admin/push'),env)).json();assert(status.publicKey);assert(!JSON.stringify(status).includes('private_jwk'));assert(!JSON.stringify(status).includes(subscription.endpoint));assert(!JSON.stringify(status).includes(subscription.keys.auth));
let sends=0;const senderMock=async(s,p,k)=>{sends++;assert.equal(s.endpoint,subscription.endpoint);assert(p.body);assert(!p.snapshot);assert(k.privateJwk.d);return {ok:true,status:201};};
const run=await runPushAlerts(env,end+120,senderMock);assert.equal(run.sent,1);assert.equal(sends,1);await runPushAlerts(env,end+900,senderMock);assert.equal(sends,1);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM push_alerts WHERE kind='surge'").get().n,1);
const row=sqlite.prepare("SELECT payload FROM push_alerts WHERE kind='surge'").get();assert(JSON.parse(row.payload).body.includes('RANDOM CLICKS 2 → 3 [1.50×]'));
// Failures retry, accepted delivery is not retried, expired subscriptions are removed.
sqlite.exec("UPDATE push_deliveries SET state='failed',attempts=1");await runPushAlerts(env,end+901,senderMock);assert.equal(sends,2);await runPushAlerts(env,end+902,senderMock);assert.equal(sends,2);
const test=await pushRoute(req('/test',{endpoint:subscription.endpoint}),env,senderMock);assert.equal(test.status,200);assert.equal((await pushRoute(req('/test',{endpoint:subscription.endpoint}),env,senderMock)).status,429);
sqlite.exec("UPDATE push_deliveries SET state='failed',attempts=1 WHERE alert_id LIKE 'hour:%'");await runPushAlerts(env,end+903,async()=>({ok:false,status:410,expired:true}));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
await pushRoute(req('/subscribe',{subscription}),env);await pushRoute(req('/unsubscribe',{endpoint:subscription.endpoint}),env);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
// Authenticated API status succeeds without exposing the signing key, wrong-origin writes fail.
const adminToken='a'.repeat(64),adminSalt='testsalt';const passwordHash=await hashPassword('TESTPASSWORD',adminSalt);sqlite.prepare('INSERT INTO admin_credentials VALUES (1,?,?,1,0,0,0)').run(passwordHash,adminSalt);
const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(adminToken))).toString('hex');sqlite.prepare('INSERT INTO admin_sessions VALUES (?,1,?)').run(digest,now+3600);
assert.equal((await worker.fetch(new Request('https://404dreams.xyz/api/admin/push',{headers:{cookie:'dream_admin='+adminToken}}),env)).status,200);
assert.equal((await worker.fetch(new Request('https://404dreams.xyz/api/admin/push/subscribe',{method:'POST',headers:{cookie:'dream_admin='+adminToken,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({subscription})}),env)).status,403);
let pending;await worker.scheduled({scheduledTime:(end+120)*1000},env,{waitUntil(p){pending=p;}});await pending;
console.log('PASS: inclusive 1.5× threshold, zero baseline, exact hourly boundaries, unique visitors and reach, continuing sessions, encrypted push round trip, signed VAPID, endpoint checks, authenticated routes, CSRF, device deduplication, retries, expired-device removal, hourly deduplication and scheduled handler.');
