const encoder=new TextEncoder(),cookieName='dream_admin',lifetime=43200;
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
const random=length=>hex(crypto.getRandomValues(new Uint8Array(length)));
const now=()=>Math.floor(Date.now()/1000);
const json=(body,status=200,cookie)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',...(cookie?{'set-cookie':cookie}:{})}});
const cookie=(request,token,age=lifetime)=>cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(request.url).protocol==='https:'?'; Secure':'');
async function digest(token){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))))}
async function hash(password,salt){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256)))}
function equal(a,b){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
async function query(db,sql,...values){if(!db?.prepare||!db?.batch)throw new Error('Database unavailable');return (await db.batch([db.prepare(sql).bind(...values)]))[0];}
async function credentials(db,env={}){
  let config=(await query(db,'SELECT * FROM admin_credentials WHERE id=1')).results?.[0];
  if(!config){if(env.REQUIRE_ADMIN_BOOTSTRAP_SECRET==='true'&&(typeof env.ADMIN_INITIAL_PASSWORD!=='string'||env.ADMIN_INITIAL_PASSWORD.length<8))throw new Error('Configure ADMIN_INITIAL_PASSWORD before first login');const salt=random(16),initial=await hash(env.ADMIN_INITIAL_PASSWORD||'0000',salt);await query(db,'INSERT OR IGNORE INTO admin_credentials (id,hash,salt,version,must_change,failures,locked_until) VALUES (1,?,?,0,1,0,0)',initial,salt);config=(await query(db,'SELECT * FROM admin_credentials WHERE id=1')).results?.[0];}
  return config;
}
export async function adminSession(request,env){
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token||!/^[0-9a-f]{64}$/.test(token))return null;
  const tokenHash=await digest(token),config=await credentials(env.DB,env),session=(await query(env.DB,'SELECT version,expires_at FROM admin_sessions WHERE token_hash=?',tokenHash)).results?.[0];
  if(!session||session.expires_at<=now()||session.version!==config.version)return null;
  return {tokenHash,config};
}
export async function guardAdmin(request,env){const session=await adminSession(request,env);if(!session)return json({error:'LOGIN REQUIRED'},401);if(session.config.must_change)return json({error:'CHANGE YOUR PASSWORD FIRST',mustChange:true},403);return null;}
async function newSession(db,version){const token=random(32);await db.batch([db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now()),db.prepare('INSERT INTO admin_sessions (token_hash,version,expires_at) VALUES (?,?,?)').bind(await digest(token),version,now()+lifetime)]);return token;}
async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('JSON REQUIRED');if(Number(request.headers.get('content-length'))>2048)throw new Error('REQUEST TOO LARGE');const text=await request.text();if(text.length>2048)throw new Error('REQUEST TOO LARGE');return JSON.parse(text);}
export async function authRoute(request,env,path){
  if(path==='/api/admin/session'&&request.method==='GET'){const session=await adminSession(request,env);return json({authenticated:!!session,mustChange:!!session?.config.must_change});}
  if(request.method!=='POST')return json({error:'METHOD NOT ALLOWED'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'ORIGIN REJECTED'},403);
  if(path==='/api/admin/logout'){const session=await adminSession(request,env);if(session)await query(env.DB,'DELETE FROM admin_sessions WHERE token_hash=?',session.tokenHash);return json({ok:true},200,cookie(request,'',0));}
  let data;try{data=await body(request)}catch{return json({error:'INVALID REQUEST'},400)}
  if(path==='/api/admin/login'){
    if(typeof data.password!=='string'||data.password.length>128)return json({error:'INVALID PASSWORD'},400);
    const config=await credentials(env.DB,env);if(config.locked_until>now())return json({error:'TOO MANY ATTEMPTS. TRY AGAIN IN A MINUTE.'},429);
    if(!equal(await hash(data.password,config.salt),config.hash)){await query(env.DB,'UPDATE admin_credentials SET failures=failures+1,locked_until=CASE WHEN failures+1>=5 THEN ? ELSE 0 END WHERE id=1',now()+60);return json({error:'INCORRECT PASSWORD'},401);}
    await query(env.DB,'UPDATE admin_credentials SET failures=0,locked_until=0 WHERE id=1');const token=await newSession(env.DB,config.version);return json({authenticated:true,mustChange:!!config.must_change},200,cookie(request,token));
  }
  if(path==='/api/admin/password'){
    const session=await adminSession(request,env);if(!session)return json({error:'LOGIN REQUIRED'},401);
    const config=session.config;
    if(typeof data.password!=='string'||data.password.length<8||data.password.length>128||data.password==='0000')return json({error:'USE AT LEAST 8 CHARACTERS'},400);
    if(!config.must_change&&(typeof data.currentPassword!=='string'||data.currentPassword.length>128||!equal(await hash(data.currentPassword,config.salt),config.hash)))return json({error:'INCORRECT CURRENT PASSWORD'},401);
    const salt=random(16),nextHash=await hash(data.password,salt);if(equal(await hash(data.password,config.salt),config.hash))return json({error:'CHOOSE A DIFFERENT PASSWORD'},400);
    const version=config.version+1,updated=await query(env.DB,'UPDATE admin_credentials SET hash=?,salt=?,version=?,must_change=0,failures=0,locked_until=0 WHERE id=1 AND version=?',nextHash,salt,version,config.version);
    if(updated.meta?.changes!==1)return json({error:'PASSWORD CHANGED ELSEWHERE. LOGIN AGAIN.'},409);
    const token=await newSession(env.DB,version);return json({authenticated:true,mustChange:false},200,cookie(request,token));
  }
  return json({error:'NOT FOUND'},404);
}

export {hash as hashPassword,equal as equalHash,random as randomHex};

export async function endAdminSession(request,env){const session=await adminSession(request,env);if(session)await query(env.DB,'DELETE FROM admin_sessions WHERE token_hash=?',session.tokenHash);return cookie(request,'',0);}
