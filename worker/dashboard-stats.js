const DAY=86400,OFFSET=32400;
export function periodWindow(days,now=Math.floor(Date.now()/1000)){
  const today=Math.floor((now+OFFSET)/DAY),startDay=days==='all'?0:today-Number(days)+1;
  return {today,startDay,since:days==='all'?0:startDay*DAY-OFFSET,chartStart:Math.max(startDay,today-89)};
}
export async function dashboardStats(db,days,now=Math.floor(Date.now()/1000)){
  const {today,startDay,since,chartStart}=periodWindow(days,now);
  const activity=`WITH action AS (SELECT v.visitor_id id,SUM(e.name='random_click') clicks,MAX(e.name='random_click') randomized,MAX(e.name='upload_complete') uploaded,MAX(e.name='save_click') save_clicked,MAX(e.name='file_created') exported,MAX(e.name='guestbook_share') shared,MAX(e.name IN ('random_click','upload_complete','save_click','setting_change','guestbook_share')) engaged FROM events e JOIN visits v USING(session_id) WHERE e.created_at>=? AND v.visitor_id IS NOT NULL GROUP BY v.visitor_id), active AS (SELECT DISTINCT visitor_id id FROM visitor_days WHERE day>=?) `;
  const rows=await db.batch([
    db.prepare(activity+`SELECT COUNT(*) users,COALESCE(SUM(a.clicks),0) random_clicks,COALESCE(SUM(a.randomized),0) random_users,COALESCE(SUM(a.uploaded),0) upload_users,COALESCE(SUM(a.save_clicked),0) save_users,COALESCE(SUM(a.exported),0) export_users,COALESCE(SUM(a.shared),0) share_users,COALESCE(SUM(a.engaged),0) engaged_users,SUM(v.first_at>=?) new_users,SUM(v.first_at<?) returning_users FROM active x JOIN visitors v ON v.id=x.id LEFT JOIN action a ON a.id=x.id`).bind(since,startDay,since,since),
    db.prepare('SELECT COUNT(DISTINCT CASE WHEN day=? THEN visitor_id END) dau,COUNT(DISTINCT CASE WHEN day>=? THEN visitor_id END) wau,COUNT(DISTINCT visitor_id) mau FROM visitor_days WHERE day>=?').bind(today,today-6,today-29),
    db.prepare('SELECT day,COUNT(*) users,SUM(CAST((v.first_at+32400)/86400 AS INTEGER)=d.day) new_users FROM visitor_days d JOIN visitors v ON v.id=d.visitor_id WHERE day>=? GROUP BY day ORDER BY day').bind(chartStart),
    db.prepare("SELECT CAST((created_at+32400)/86400 AS INTEGER) day,COUNT(DISTINCT session_id) sessions,SUM(name='random_click' AND v.visitor_id IS NOT NULL) clicks,COUNT(DISTINCT CASE WHEN name='random_click' THEN v.visitor_id END) random_users,COUNT(DISTINCT CASE WHEN name='file_created' THEN v.visitor_id END) export_users FROM events e LEFT JOIN visits v USING(session_id) WHERE created_at>=? GROUP BY day ORDER BY day").bind(chartStart*DAY-OFFSET),
    db.prepare('SELECT CAST((first_at+32400)/86400 AS INTEGER) day,COUNT(*) sessions,SUM(visitor_id IS NULL) legacy_sessions FROM visits WHERE first_at>=? GROUP BY day').bind(chartStart*DAY-OFFSET),
    db.prepare(activity+`SELECT CASE WHEN COALESCE(a.clicks,0)=0 THEN '0' WHEN a.clicks=1 THEN '1' WHEN a.clicks<=5 THEN '2–5' WHEN a.clicks<=10 THEN '6–10' ELSE '11+' END bucket,COUNT(*) users FROM active x LEFT JOIN action a ON a.id=x.id GROUP BY bucket`).bind(since,startDay),
    db.prepare('SELECT MIN(first_at) started FROM visitors').bind(),
    db.prepare('SELECT COUNT(*) sessions,SUM(visitor_id IS NULL) legacy_sessions FROM visits WHERE first_at>=?').bind(since),
    db.prepare(`WITH cohorts AS (SELECT id,CAST((first_at+32400)/86400 AS INTEGER) day FROM visitors WHERE first_at>=?) SELECT c.day,COUNT(*) users,SUM(EXISTS(SELECT 1 FROM visitor_days d WHERE d.visitor_id=c.id AND d.day=c.day+1)) d1,SUM(EXISTS(SELECT 1 FROM visitor_days d WHERE d.visitor_id=c.id AND d.day=c.day+3)) d3,SUM(EXISTS(SELECT 1 FROM visitor_days d WHERE d.visitor_id=c.id AND d.day=c.day+7)) d7,SUM(EXISTS(SELECT 1 FROM visitor_days d WHERE d.visitor_id=c.id AND d.day=c.day+14)) d14,SUM(EXISTS(SELECT 1 FROM visitor_days d WHERE d.visitor_id=c.id AND d.day=c.day+30)) d30 FROM cohorts c GROUP BY c.day ORDER BY c.day DESC`).bind(since)
  ]);
  const result=i=>rows[i].results||[],overview=result(0)[0]||{},rolling=result(1)[0]||{};
  const userByDay=new Map(result(2).map(x=>[x.day,x])),eventByDay=new Map(result(3).map(x=>[x.day,x])),sessionByDay=new Map(result(4).map(x=>[x.day,x]));
  const daily=[];for(let day=chartStart;day<=today;day++){const u=userByDay.get(day)||{},e=eventByDay.get(day)||{},s=sessionByDay.get(day)||{};daily.push({day,date:new Date(day*DAY*1000).toISOString().slice(0,10),users:u.users||0,newUsers:u.new_users||0,returningUsers:(u.users||0)-(u.new_users||0),sessions:s.sessions||0,legacySessions:s.legacy_sessions||0,clicks:e.clicks||0,randomUsers:e.random_users||0,exportUsers:e.export_users||0});}
  const offsets=[1,3,7,14,30],cohorts=result(8);
  const retention=offsets.map(offset=>{const mature=cohorts.filter(c=>c.day+offset<today),eligible=mature.reduce((n,c)=>n+c.users,0),returned=mature.reduce((n,c)=>n+c['d'+offset],0);return {offset,eligible,returned,rate:eligible?returned/eligible*100:null};});
  return {overview,rolling,daily,distribution:result(5),trackingStarted:result(6)[0]?.started||null,sessions:result(7)[0]||{},retention,cohorts:cohorts.slice(0,30).map(c=>({...c,cells:offsets.map(offset=>({offset,returned:c['d'+offset],rate:c.day+offset<today?c['d'+offset]/c.users*100:null}))})),today,startDay,chartStart};
}
