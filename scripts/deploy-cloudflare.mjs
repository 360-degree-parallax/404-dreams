import {readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const configPath='wrangler.json';
const config=JSON.parse(await readFile(configPath,'utf8'));
if(config.main!=='worker/index.js'||config.assets?.binding!=='ASSETS'||config.assets?.run_worker_first!==true)throw new Error('Server entrypoint and assets binding must be configured together.');
await access(config.main);
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.d1_databases?.[0]?.database_id||''))throw new Error('Set the actual Cloudflare D1 database_id in wrangler.json first.');
for(const args of [['d1','migrations','apply','404-dreams-db','--remote'],['deploy']]){
  const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','wrangler@4',...args,'--config',configPath],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
