import assert from 'node:assert/strict';
import {queryCategory,summarizeUsage,fetchCloudflareUsage,usageRoute} from '../worker/cloudflare-usage.js';
import worker from '../worker/index.js';
const cases=[['SELECT * FROM admin_sessions WHERE token_hash=?','AUTH'],['SELECT * FROM push_alerts','PUSH'],['SELECT * FROM guestbook','GUESTBOOK'],['INSERT OR IGNORE INTO events VALUES (?)','COLLECTION'],['UPDATE visits SET ip=NULL WHERE first_at<?','MAINTENANCE'],['SELECT COUNT(*) FROM events WHERE created_at>=?','STATS'],['SELECT COUNT(*) FROM events WHERE created_at>=? AND created_at<?','PUSH'],['SELECT 1 FROM unknown_table','OTHER']];for(const [q,c] of cases)assert.equal(queryCategory(q),c);
const fixture={d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:1000,rowsWritten:100}}],d1QueriesAdaptiveGroups:[{dimensions:{query:'SELECT * FROM events'},sum:{rowsRead:600,rowsWritten:0},count:3},{dimensions:{query:'SELECT * FROM push_alerts'},sum:{rowsRead:300,rowsWritten:0},count:10}]};
const report=summarizeUsage(fixture,'START','END');assert.equal(report.totalRead,1000);assert.equal(report.coverage,90);assert.equal(report.groups.find(g=>g.category==='STATS').share,60);assert.equal(report.groups.find(g=>g.category==='UNATTRIBUTED').reads,100);assert.equal(summarizeUsage({},'','').coverage,null);
let calls=0;await assert.rejects(fetchCloudflareUsage({},async()=>{calls++;}),e=>e.code==='ANALYTICS_TOKEN_REQUIRED');assert.equal(calls,0);
const mock=async(url,options)=>{
  calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');assert.equal(options.headers.authorization,'Bearer PRIVATE_TEST_TOKEN');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert(!body.query.includes('ZoneWorkersRequestsFilter_InputObject'));
  const isTotals=body.query.includes('d1AnalyticsAdaptiveGroups');
  if(isTotals){assert(body.query.includes('date_geq: "2026-10-09"'));assert(body.query.includes('limit: 1'));}
  else {assert(body.query.includes('limit: 100'));assert(body.query.includes('datetimeHour_geq: "2026-10-09T00:00:00Z"'));}
  assert(body.query.includes('dcf6bb51-db96-4cbd-8c36-c4255856f0b1'));
  const field=isTotals?'d1AnalyticsAdaptiveGroups':'d1QueriesAdaptiveGroups';
  return new Response(JSON.stringify({data:{viewer:{accounts:[{[field]:fixture[field]}]}}}));
};
const data=await fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'  PRIVATE_TEST_TOKEN\n'},mock,new Date('2026-10-09T14:50:00Z'));assert.equal(data.totalRead,1000);assert.equal(data.insightsAvailable,true);assert.deepEqual(data.warnings,[]);assert(!JSON.stringify(data).includes('PRIVATE_TEST_TOKEN'));assert.equal(calls,2);
const cfError=message=>new Response(JSON.stringify({errors:[{message}]}));
await assert.rejects(fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async()=>cfError('PRIVATE_TEST_TOKEN')),e=>!e.message.includes('PRIVATE_TEST_TOKEN'));
await assert.rejects(fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async()=>cfError('unknown argument filter')),e=>e.code==='ANALYTICS_API_ERROR'&&e.message.includes('unknown argument filter'));
await assert.rejects(fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async()=>cfError('not authorized')),e=>e.code==='ANALYTICS_PERMISSION');
await assert.rejects(fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async()=>new Response('{}',{status:403})),e=>e.code==='ANALYTICS_PERMISSION');
await assert.rejects(fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async()=>{throw Error('PRIVATE_TEST_TOKEN');}),e=>e.code==='ANALYTICS_NETWORK_ERROR'&&!e.message.includes('PRIVATE_TEST_TOKEN'));
await assert.rejects(fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async()=>new Response('{}')),e=>e.message.includes('ACCOUNT OR DATASET NOT AVAILABLE'));
const partial=await fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async(url,options)=>JSON.parse(options.body).query.includes('d1AnalyticsAdaptiveGroups')?mock(url,options):cfError('dataset disabled PRIVATE_TEST_TOKEN'),new Date('2026-10-09T14:50:00Z'));
assert.equal(partial.totalRead,1000);assert.equal(partial.insightsAvailable,false);assert.equal(partial.coverage,0);assert.equal(partial.groups[0].category,'UNATTRIBUTED');assert(!partial.warnings[0].includes('PRIVATE_TEST_TOKEN'));assert(partial.warnings[0].includes('dataset disabled'));
const empty=await fetchCloudflareUsage({CF_ANALYTICS_TOKEN:'PRIVATE_TEST_TOKEN'},async(url,options)=>new Response(JSON.stringify({data:{viewer:{accounts:[{[JSON.parse(options.body).query.includes('d1AnalyticsAdaptiveGroups')?'d1AnalyticsAdaptiveGroups':'d1QueriesAdaptiveGroups']:[]}]}}})));
assert.equal(empty.totalRead,0);assert.equal(empty.insightsAvailable,true);assert.equal(empty.coverage,null);
assert.equal((await usageRoute(new Request('https://404dreams.xyz/api/admin/d1-usage'),{DB:{}})).status,503);
assert.equal((await usageRoute(new Request('https://404dreams.xyz/api/admin/d1-usage',{method:'POST'}),{})).status,405);
assert.equal((await worker.fetch(new Request('https://404dreams.xyz/api/admin/d1-usage'),{DB:{}})).status,401);
console.log('PASS: UTC-day analytics, independent dataset filters and totals, partial Insights failures, sanitized diagnostic errors, SQL categories and unattributed coverage, missing-secret state, token redaction, fixed read-only upstream, admin guard and method checks.');
