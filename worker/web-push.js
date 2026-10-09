// RFC 8291 aes128gcm and RFC 8292 VAPID, using the Workers Web Crypto API.
const enc=new TextEncoder();
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function unbase64url(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('INVALID PUSH KEY');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
const concat=(...arrays)=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length;}return out;};
export function validPushEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&value.length<=2048&&u.pathname!=='/'&&(u.hostname.endsWith('.push.apple.com')||u.hostname==='fcm.googleapis.com'||u.hostname==='fcmregistrations.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com'));}catch{return false;}}
export async function validateSubscription(s){
  if(!validPushEndpoint(s?.endpoint))throw new Error('UNSUPPORTED PUSH SERVICE');
  const pub=unbase64url(s.keys?.p256dh),auth=unbase64url(s.keys?.auth);
  if(pub.length!==65||pub[0]!==4||auth.length!==16)throw new Error('INVALID PUSH KEY');
  await crypto.subtle.importKey('raw',pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
  return {endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function createVapidKeys(){const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {publicKey:base64url(await crypto.subtle.exportKey('raw',k.publicKey)),privateJwk:await crypto.subtle.exportKey('jwk',k.privateKey)};}
async function hkdf(input,salt,info,length){const key=await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));}
export async function encryptPush(subscription,payload){
  const plain=enc.encode(JSON.stringify(payload));if(plain.length>3000)throw new Error('PUSH TOO LARGE');
  const receiver=unbase64url(subscription.keys.p256dh),auth=unbase64url(subscription.keys.auth);
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const sender=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const peer=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},pair.privateKey,256));
  const ikm=await hkdf(shared,auth,concat(enc.encode('WebPush: info\0'),receiver,sender),32),salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,concat(plain,new Uint8Array([2]))));
  const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=65;
  return concat(header,sender,cipher);
}
export async function vapidAuthorization(endpoint,keys,now=Math.floor(Date.now()/1000)){
  const unsigned=base64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+base64url(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:now+43200,sub:'https://404dreams.xyz/'})));
  const key=await crypto.subtle.importKey('jwk',keys.privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(unsigned));
  return 'vapid t='+unsigned+'.'+base64url(signature)+', k='+keys.publicKey;
}
export async function sendWebPush(subscription,payload,keys,fetcher=fetch){
  await validateSubscription(subscription);
  const body=await encryptPush(subscription,payload),authorization=await vapidAuthorization(subscription.endpoint,keys);
  const res=await fetcher(subscription.endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{authorization,'content-encoding':'aes128gcm','content-type':'application/octet-stream',TTL:'3600',Urgency:'normal'},body});
  return {ok:res.status>=200&&res.status<300,expired:[404,410].includes(res.status),status:res.status};
}
