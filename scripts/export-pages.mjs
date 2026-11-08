import { createHash } from 'node:crypto';
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const storage=JSON.parse(await readFile(new URL('config/storage.json',root),'utf8'));
const sharedConfig=`<script>globalThis.FIVE_STARS_STORAGE_URL=${JSON.stringify(storage.url)};</script>`;
await rm(output, {recursive:true,force:true});
await mkdir(output, {recursive:true});
for (const file of ['app.js','style.css','share-cover-v2.jpg','local-store.js','google-store.js']) await copyFile(new URL(`public/${file}`,root),new URL(file,output));
const hash = content => createHash('sha256').update(content).digest('hex').slice(0,12);
const catalogVersion=hash(await readFile(new URL('data/catalog.json',root)));
let appCode = await readFile(new URL('public/app.js',root),'utf8');
for(const file of ['local-store.js','google-store.js']) {
 const version=hash(await readFile(new URL(`public/${file}`,root)));
 appCode=appCode.replace(`'./${file}'`,`'./${file}?v=${version}'`);
}
appCode=appCode.replace("'./catalog.json'",`'./catalog.json?v=${catalogVersion}'`);
await writeFile(new URL('app.js',output),appCode);
const cssVersion=hash(await readFile(new URL('public/style.css',root)));
const html = (await readFile(new URL('public/index.html',root),'utf8'))
 .replace('href="style.css"',`href="style.css?v=${cssVersion}"`)
 .replace('src="app.js"',`src="app.js?v=${hash(appCode)}"`);
await writeFile(new URL('index.html',output),html.replace('<script type="module"',sharedConfig+'<script>globalThis.FIVE_STARS_PREVIEW = true;</script><script type="module"'));
await copyFile(new URL('data/catalog.json',root),new URL('catalog.json',output));
await mkdir(new URL('test/',output),{recursive:true});
for(const file of ['app.js','style.css','share-cover-v2.jpg','local-store.js','google-store.js','catalog.json']) await copyFile(new URL(file,output),new URL(`test/${file}`,output));
await writeFile(new URL('test/index.html',output),html.replace('<script type="module"','<script>globalThis.FIVE_STARS_PREVIEW = true;globalThis.FIVE_STARS_SANDBOX = true;</script><script type="module"'));
// A separate statistics URL for live-local and isolated sandbox ballots.
let statsCode=await readFile(new URL('public/stats.js',root),'utf8');
const storeVersion=hash(await readFile(new URL('public/local-store.js',root)));
statsCode=statsCode.replace("'../local-store.js'",`'../local-store.js?v=${storeVersion}'`);
statsCode=statsCode.replace("'../catalog.json'",`'../catalog.json?v=${catalogVersion}'`);
const googleStoreVersion=hash(await readFile(new URL('public/google-store.js',root)));
statsCode=statsCode.replace("'../google-store.js'",`'../google-store.js?v=${googleStoreVersion}'`);
const statsHtml=(await readFile(new URL('public/stats.html',root),'utf8'))
 .replace('href="../style.css"',`href="../style.css?v=${cssVersion}"`)
 .replace('src="stats.js"',`src="stats.js?v=${hash(statsCode)}"`);
for(const prefix of ['', 'test/']) {
 await mkdir(new URL(`${prefix}stats/`,output),{recursive:true});
 await writeFile(new URL(`${prefix}stats/stats.js`,output),statsCode);
 await writeFile(new URL(`${prefix}stats/index.html`,output),prefix?statsHtml.replace('<script type="module"','<script>globalThis.FIVE_STARS_SANDBOX = true;</script><script type="module"'):statsHtml.replace('<script type="module"',sharedConfig+'<script type="module"'));
}
await mkdir(new URL('names/',output),{recursive:true});
await copyFile(new URL('public/names.html',root),new URL('names/index.html',output));
await writeFile(new URL('.nojekyll',output),'');
console.log('Exported live catalog with shared-storage connection when configured, and isolated local test environment.');
