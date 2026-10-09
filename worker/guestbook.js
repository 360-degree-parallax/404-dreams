import {hashPassword,equalHash,randomHex} from './admin-auth.js';
import {resetOldGuestbook} from './guestbook-reset.js';
const idPattern=/^[a-zA-Z0-9_-]{8,80}$/;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const upper=s=>s.replace(/[a-z]/g,c=>c.toUpperCase());
async function voter(request){let token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dream_like='))?.slice(11),cookie=null;if(!/^[0-9a-f]{64}$/.test(token||'')){token=randomHex(32);cookie='dream_like='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'+(new URL(request.url).protocol==='https:'?'; Secure':'');}const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));return {hash:Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join(''),cookie};}
function withCookie(response,cookie){if(cookie)response.headers.set('set-cookie',cookie);return response;}
async function removePost(env,post){await env.MEDIA.delete(post.image_key);await env.DB.batch([env.DB.prepare('DELETE FROM guestbook_likes WHERE post_id=?').bind(post.id),env.DB.prepare('DELETE FROM guestbook WHERE id=?').bind(post.id)]);}
export async function adminDeleteGuestPost(request,env){
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin rejected'},403);
  const id=new URL(request.url).pathname.split('/').at(-2),rows=await env.DB.batch([env.DB.prepare('SELECT id,image_key FROM guestbook WHERE id=?').bind(id)]),post=rows[0].results?.[0];
  if(!post)return reply({error:'Post not found'},404);await removePost(env,post);return reply({deleted:true});
}
export async function guestbook(request,env){
  if(!env.DB||!env.MEDIA)throw new Error('Guestbook unavailable');
  await resetOldGuestbook(env);
  const url=new URL(request.url);
  const liking=url.pathname.match(/^\/api\/guestbook\/([0-9a-f-]{36})\/like$/);
  if(liking){
    if(request.method!=='POST')return reply({error:'Method not allowed'},405);
    if(request.headers.get('origin')!==url.origin)return reply({error:'Origin rejected'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required'},415);
    const raw=await request.text();if(raw.length>1024)return reply({error:'Request too large'},413);let data;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}if(data.liked!==true)return reply({error:'Likes can only be added'},400);
    const found=await env.DB.batch([env.DB.prepare('SELECT id FROM guestbook WHERE id=?').bind(liking[1])]);if(!found[0].results?.length)return reply({error:'Post not found'},404);
    const identity=await voter(request),statement=env.DB.prepare('INSERT OR IGNORE INTO guestbook_likes (id,post_id,voter_hash,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM guestbook WHERE id=?)').bind(crypto.randomUUID(),liking[1],identity.hash,Date.now(),liking[1]);
    const result=await env.DB.batch([statement,env.DB.prepare('SELECT COUNT(*) likes FROM guestbook_likes WHERE post_id=?').bind(liking[1])]);return withCookie(reply({liked:data.liked,likes:result[1].results?.[0]?.likes||0}),identity.cookie);
  }
  const deletion=url.pathname.match(/^\/api\/guestbook\/([0-9a-f-]{36})\/delete$/);
  if(deletion){
    if(request.method!=='POST')return reply({error:'Method not allowed'},405);
    if(request.headers.get('origin')!==url.origin)return reply({error:'Origin rejected'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required'},415);
    const raw=await request.text();if(raw.length>2048)return reply({error:'Request too large'},413);
    let data;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
    if(typeof data.password!=='string'||data.password.length>128)return reply({error:'Invalid password'},400);
    const found=await env.DB.batch([env.DB.prepare('SELECT * FROM guestbook WHERE id=?').bind(deletion[1])]),row=found[0].results?.[0];
    if(!row)return reply({error:'Post not found'},404);
    if(!row.password_hash)return reply({error:'This older post has no deletion password. Contact the operator.'},403);
    const now=Math.floor(Date.now()/1000);if(row.locked_until>now)return reply({error:'Too many attempts. Try again in a minute.'},429);
    if(!equalHash(await hashPassword(upper(data.password),row.password_salt),row.password_hash)){
      await env.DB.batch([env.DB.prepare('UPDATE guestbook SET failures=failures+1,locked_until=CASE WHEN failures+1>=5 THEN ? ELSE 0 END WHERE id=?').bind(now+60,row.id)]);
      return reply({error:'Incorrect password'},401);
    }
    await removePost(env,row);
    return reply({deleted:true});
  }
  if(url.pathname.startsWith('/api/guestbook/image/')){
    if(request.method!=='GET')return reply({error:'Method not allowed'},405);
    const id=url.pathname.split('/').at(-1);if(!/^[0-9a-f-]{36}$/.test(id))return reply({error:'Not found'},404);
    const row=await env.DB.batch([env.DB.prepare('SELECT image_key FROM guestbook WHERE id=?').bind(id)]);
    if(!row[0].results?.length)return reply({error:'Not found'},404);
    const image=await env.MEDIA.get(row[0].results[0].image_key);if(!image)return reply({error:'Not found'},404);
    return new Response(image.body,{headers:{'content-type':'image/png','x-content-type-options':'nosniff','cache-control':'private, no-store'}});
  }
  if(url.pathname!=='/api/guestbook')return reply({error:'Not found'},404);
  if(request.method==='GET'){
    const before=url.searchParams.get('before')||'9999999999999';if(!/^\d{1,13}$/.test(before))return reply({error:'Invalid cursor'},400);
    const identity=await voter(request);
    const rows=await env.DB.batch([env.DB.prepare('SELECT g.rowid cursor,g.id,g.created_at,g.text,g.name,g.width,g.height,g.password_hash IS NOT NULL deletable,(SELECT COUNT(*) FROM guestbook_likes l WHERE l.post_id=g.id) likes,EXISTS(SELECT 1 FROM guestbook_likes l WHERE l.post_id=g.id AND l.voter_hash=?) liked FROM guestbook g WHERE g.rowid<? ORDER BY g.rowid DESC LIMIT 21').bind(identity.hash,Number(before))]);
    const all=rows[0].results||[],posts=all.slice(0,20);return withCookie(reply({posts,next:all.length>20?posts.at(-1).cursor:null}),identity.cookie);
  }
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==url.origin)return reply({error:'Origin rejected'},403);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return reply({error:'Current result required'},415);
  const max=4*1024*1024;
  if(Number(request.headers.get('content-length'))>max)return reply({error:'Image too large'},413);
  const bytes=await request.arrayBuffer();if(bytes.byteLength>max)return reply({error:'Image too large'},413);
  let form;try{form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')}}).formData();}catch{return reply({error:'Invalid result'},400);}
  if([...form.keys()].some(k=>!['result','sessionId','viewId','text','name','password'].includes(k)))return reply({error:'External attachments are not accepted'},400);
  const sessionId=form.get('sessionId'),viewId=form.get('viewId'),text=form.get('text')||'',file=form.get('result'),name=form.get('name'),password=form.get('password');
  if(!idPattern.test(sessionId)||!idPattern.test(viewId)||typeof text!=='string'||text.length>280||!file||typeof file.arrayBuffer!=='function'||file.type!=='image/png')return reply({error:'Invalid result'},400);
  if(typeof name!=='string'||!name.trim()||name.length>32||typeof password!=='string'||password.length<4||password.length>128)return reply({error:'Name and password (4+ characters) required'},400);
  const source=await env.DB.batch([env.DB.prepare("SELECT id FROM events WHERE session_id=? AND view_id=? AND name='generated' LIMIT 1").bind(sessionId,viewId)]);
  if(!source[0].results?.length)return reply({error:'Generate a result before sharing'},409);
  const png=new Uint8Array(await file.arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
  if(png.length<33||signature.some((v,i)=>png[i]!==v)||String.fromCharCode(...png.slice(12,16))!=='IHDR')return reply({error:'PNG result required'},400);
  const header=new DataView(png.buffer,png.byteOffset,png.byteLength),width=header.getUint32(16),height=header.getUint32(20);
  if(!width||!height||width>960||height>960)return reply({error:'Invalid result size'},400);
  let offset=8,hasData=false,finished=false;
  while(offset+12<=png.length){const size=header.getUint32(offset),type=String.fromCharCode(...png.slice(offset+4,offset+8));if(offset+size+12>png.length)break;if(type==='IDAT')hasData=true;if(type==='IEND'){finished=size===0&&offset+12===png.length;break;}offset+=size+12;}
  if(!hasData||!finished)return reply({error:'Invalid PNG result'},400);
  // An existing generated view can be shared once. No remote image URLs are fetched.
  const existing=await env.DB.batch([env.DB.prepare('SELECT id FROM guestbook WHERE view_id=?').bind(viewId)]);
  if(existing[0].results?.length)return reply({id:existing[0].results[0].id,alreadyShared:true});
  const id=crypto.randomUUID(),key='guestbook/'+id+'.png',salt=randomHex(16),passwordHash=await hashPassword(upper(password),salt);
  await env.MEDIA.put(key,png,{httpMetadata:{contentType:'image/png'}});
  try{await env.DB.batch([env.DB.prepare('INSERT INTO guestbook (id,created_at,session_id,view_id,text,image_key,width,height,name,password_hash,password_salt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id,Date.now(),sessionId,viewId,upper(text.replace(/[^\S\r\n]+/g,'')),key,width,height,upper(name.trim()),passwordHash,salt)]);}catch(error){await env.MEDIA.delete(key);const winner=await env.DB.batch([env.DB.prepare('SELECT id FROM guestbook WHERE view_id=?').bind(viewId)]);if(winner[0].results?.length)return reply({id:winner[0].results[0].id,alreadyShared:true});throw error;}
  return reply({id},201);
}
