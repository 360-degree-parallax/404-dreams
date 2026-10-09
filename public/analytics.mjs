// An ephemeral tab session; the server database is the authoritative event log.
const uuid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const sessionId=uuid();
let visitorId=uuid();
try{const saved=JSON.parse(localStorage.getItem('dream-visitor')||'null');if(saved&&/^[0-9a-f]{32}$/.test(saved.id)&&saved.expires>Date.now())visitorId=saved.id;else localStorage.setItem('dream-visitor',JSON.stringify({id:visitorId,expires:Date.now()+365*86400000}));}catch{}
const params=new URL(location.href).searchParams;
const attribution={source:(params.get('utm_source')||'').slice(0,120),medium:(params.get('utm_medium')||'').slice(0,120),campaign:(params.get('utm_campaign')||'').slice(0,120),content:(params.get('utm_content')||'').slice(0,120),referrer:''};
try{attribution.referrer=document.referrer?new URL(document.referrer).origin:'';}catch{}
let visitSent=false;
async function sendVisit(){if(visitSent)return;try{const r=await fetch('/api/visit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,visitorId,attribution}),keepalive:true});visitSent=r.ok;}catch{}}
sendVisit();
addEventListener('online',sendVisit);
let viewId=uuid(),snapshot=()=>null,pending=[],sending=false,timer=null,retries=0;
export function configureAnalytics(getSnapshot){snapshot=getSnapshot;}
export function capture(){return {...snapshot(),sessionId,visitorId,viewId,attribution};}
export function track(name,format='',captured){const data=captured||capture();if(!data.palette)return;pending.push({...data,id:uuid(),name,format});if(pending.length>200)pending.shift();clearTimeout(timer);timer=setTimeout(flush,150);}
export function beginView(){viewId=uuid();track('generated');}
async function flush(){if(sending||!pending.length)return;sending=true;const batch=pending.slice(0,20);try{const r=await fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true});if(!r.ok)throw new Error('EVENT COLLECTION UNAVAILABLE');pending.splice(0,batch.length);retries=0;}catch(error){retries++;console.warn('404 DREAMS analytics:',error.message);}finally{sending=false;if(pending.length&&retries<5)timer=setTimeout(flush,Math.min(15000,500*2**retries));}}
addEventListener('pagehide',()=>{if(!pending.length)return;const batch=pending.slice(0,20);fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true}).catch(()=>{});});
addEventListener('online',()=>{retries=0;flush();});

export async function flushAnalytics(){for(let tries=0;pending.length&&tries<12;tries++){if(sending){await new Promise(resolve=>setTimeout(resolve,100));continue;}await flush();if(pending.length&&retries)throw new Error('CONNECTION FAILED. RETRY.');}if(pending.length)throw new Error('CONNECTION BUSY. RETRY.');}
