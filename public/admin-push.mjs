const $=id=>document.getElementById(id),ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
let state=null,registration=null,busy=false;
async function api(path,body){const r=await fetch('/api/admin/push'+path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(data.error||'PUSH UNAVAILABLE');return data;}
function status(text){$('pushStatus').textContent=text;}
async function localSubscription(){return registration?.pushManager.getSubscription()||null;}
function supported(){return isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function paint(data){
  const s=data.snapshot;const t=n=>new Date(n*1000).toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
  $('pushWindow').textContent=t(s.start)+'–'+t(s.end)+' KST / PREVIOUS '+t(s.previousStart)+'–'+t(s.start)+' / '+data.subscriptions.length+' CONNECTED DEVICES';
  $('pushHistory').replaceChildren();
  if(!data.history.length){$('pushHistory').textContent='NO ALERTS YET.';return;}
  for(const item of data.history){const row=document.createElement('div');row.className='push-log';const label=document.createElement('strong');label.textContent=item.kind==='test'?'TEST PUSH':'METRIC SURGE';const time=document.createElement('small');time.textContent=new Date(item.created_at*1000).toLocaleString('en-GB',{timeZone:'Asia/Seoul'})+' KST / '+(item.sent||0)+' SENT / '+(item.failed||0)+' FAILED';const body=document.createElement('p');body.textContent=item.payload.body;row.append(label,time,body);$('pushHistory').append(row);}
}
export async function loadPush(){
  try{
    state=await api('');paint(state);
    const install=ios()&&!standalone();$('pushInstall').hidden=!install;
    if(install){status('ADD THIS ADMIN PAGE TO HOME SCREEN, THEN OPEN ITS ICON.');$('pushEnable').disabled=true;return;}
    if(!supported()){status('WEB PUSH IS NOT AVAILABLE IN THIS BROWSER. USE SAFARI / CHROME WITH HTTPS.');$('pushEnable').disabled=true;return;}
    registration=await navigator.serviceWorker.register('/admin-push-sw.js',{scope:'/admin',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    const sub=await localSubscription();
    const key=sub?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sub.endpoint))),n=>n.toString(16).padStart(2,'0')).join(''):null;
    const connected=!!sub&&state.subscriptions.some(s=>s.id===key);
    $('pushEnable').disabled=connected;$('pushTest').disabled=!connected;$('pushDisable').disabled=!sub;
    status(connected?'CONNECTED / ALERTS CONTINUE WHEN THIS PAGE IS CLOSED.':Notification.permission==='denied'?'NOTIFICATIONS BLOCKED. ALLOW THEM IN DEVICE / BROWSER SETTINGS.':'NOT CONNECTED / ENABLE PUSH ON THIS DEVICE.');
  }catch(e){status(e.message);}
}
async function operate(task){if(busy)return;busy=true;for(const id of ['pushEnable','pushTest','pushDisable'])$(id).disabled=true;try{const message=await task();await loadPush();if(message)status(message);}catch(e){await loadPush();status(e.message);}finally{busy=false;}}
$('pushEnable').onclick=()=>{
  // Request permission directly from the tap, before network requests or other awaited work.
  if(!supported())return;
  const permission=Notification.requestPermission();
  operate(async()=>{if(await permission!=='granted')throw new Error('NOTIFICATION PERMISSION WAS NOT GRANTED.');if(!state||!registration)throw new Error('RELOAD THE DASHBOARD AND RETRY.');let sub=await localSubscription();if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(state.publicKey)});await api('/subscribe',{subscription:sub.toJSON()});status('CONNECTED. USE TEST PUSH TO CHECK DELIVERY.');});
};
$('pushTest').onclick=()=>operate(async()=>{const sub=await localSubscription();if(!sub)throw new Error('ENABLE PUSH FIRST');await api('/test',{endpoint:sub.endpoint});return 'TEST ACCEPTED BY PUSH SERVICE. CHECK YOUR PHONE NOTIFICATIONS.';});
$('pushDisable').onclick=()=>operate(async()=>{const sub=await localSubscription();if(sub){await api('/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}});
