import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(await readFile('wrangler.cloudflare.json','utf8'));
if(!/^[0-9a-f-]{36}$/i.test(config.d1_databases[0].database_id))throw new Error('Set the actual Cloudflare D1 database_id in wrangler.cloudflare.json first.');
for(const args of [['d1','migrations','apply','404-dreams-db','--remote'],['deploy']]){const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','wrangler@4',...args,'--config','wrangler.cloudflare.json'],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
