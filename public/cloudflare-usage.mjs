const $=id=>document.getElementById(id),num=n=>Number(n||0).toLocaleString('en-US');
const labels={STATS:'ADMIN STATS',PUSH:'PUSH ALERTS',AUTH:'ADMIN AUTH',GUESTBOOK:'GUESTBOOK',COLLECTION:'VISITS / EVENTS',MAINTENANCE:'MAINTENANCE',OTHER:'OTHER SQL',UNATTRIBUTED:'UNATTRIBUTED'};
$('readD1Usage').onclick=async()=>{
  $('readD1Usage').disabled=true;$('d1UsageStatus').textContent='READING CLOUDFLARE ANALYTICS...';
  try{const r=await fetch('/api/admin/d1-usage',{cache:'no-store'}),data=await r.json();if(!r.ok){$('d1UsageSummary').textContent='USAGE NOT LOADED';$('d1UsageGroups').replaceChildren();$('d1UsageQueries').replaceChildren();throw new Error(data.error||'USAGE UNAVAILABLE');}
    $('d1UsageSummary').textContent=num(data.totalRead)+' ROWS READ / '+data.percent.toFixed(1)+'% OF FREE DAILY CAP · '+num(data.totalWrite)+' ROWS WRITTEN';
    $('d1UsageGroups').replaceChildren();
    for(const g of data.groups){const row=document.createElement('div');row.className='d1-usage-row';const label=document.createElement('span');label.textContent=labels[g.category]||g.category;const n=document.createElement('strong');n.textContent=num(g.reads)+' / '+(g.share===null?'—':g.share.toFixed(1)+'%');const bar=document.createElement('div');bar.className='d1-usage-track';const fill=document.createElement('span');fill.style.width=Math.min(100,g.share||0)+'%';bar.append(fill);row.append(label,n,bar);$('d1UsageGroups').append(row);}
    $('d1UsageQueries').replaceChildren();for(const q of data.top){const row=document.createElement('details');const label=document.createElement('summary');label.textContent=(labels[q.category]||q.category)+' / '+num(q.reads)+' READS / '+num(q.calls)+' CALLS';const code=document.createElement('pre');code.textContent=q.query;row.append(label,code);$('d1UsageQueries').append(row);}
    $('d1UsageStatus').textContent='TODAY UTC / RESETS AT 09:00 KST. UPDATED '+new Date(data.updatedAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul'})+' KST'+(data.cacheHit?' / CACHED ≤60S':'')+' / QUERY COVERAGE '+(data.coverage===null?'—':data.coverage.toFixed(1)+'%')+'. SQL CATEGORIES ARE INFERRED; ANALYTICS MAY BE DELAYED.'+(data.queryLimitReached?' / TOP 100 QUERIES ONLY.':'')+(data.warnings?.length?' / QUERY INSIGHTS UNAVAILABLE: '+data.warnings.join(' / '):'');
  }catch(e){$('d1UsageStatus').textContent=e.message;}finally{$('readD1Usage').disabled=false;}
};
