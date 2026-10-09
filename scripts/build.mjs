import {mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const dir of ['public','worker','drizzle']) await cp(dir,'dist/'+dir,{recursive:true});
const config=JSON.parse(await readFile('wrangler.cloudflare.json','utf8'));
await writeFile('dist/wrangler.cloudflare.json',JSON.stringify(config,null,2));
console.log('Cloudflare source prepared in dist/');
