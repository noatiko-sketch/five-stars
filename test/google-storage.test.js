import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(template='../backend/Code.gs',options={}){
 const requestedSheets=new Set();
 const people=options.people||[{id:'a',name:'A'},{id:'b',name:'B'},{id:'gone',name:'Gone',active:false}];
 const songs=options.songs||Array.from({length:16},(_,i)=>({id:'s'+i,people:[i===15?'a':'b']}));
 const rows=(options.rows||people.map(p=>[p.id,'{}','[]',0,''])).map(row=>row.slice());let locked=false;
 const sheet={getLastRow:()=>rows.length+1,getRange(row,col,n=1,m=1){return {getValues:()=>Array.from({length:n},(_,i)=>(rows[row-2+i]||Array(5).fill('')).slice(col-1,col-1+m)),setValues:values=>{for(let i=0;i<n;i++)for(let j=0;j<m;j++)(rows[row-2+i] ||= Array(5).fill(''))[col-1+j]=values[i][j];}};}};
 let extra=null;let uuid=0;const extraSheet={getLastRow:()=>extra.length,getRange(row,col,n=1,m=1){return{getValues:()=>extra.slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+m)),setValues:values=>{for(let i=0;i<n;i++)extra[row-1+i]=values[i].slice();}};}};
 const context=vm.createContext({Utilities:{getUuid:()=>String(++uuid)},SpreadsheetApp:{openById:()=>({getSheetByName:name=>{if(name==='משתתפים נוספים')return extra?extraSheet:null;requestedSheets.add(name);return sheet;},insertSheet(){extra=[];return extraSheet;}}),flush(){}},LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})}});
 const source=readFileSync(new URL(template,import.meta.url),'utf8').split('const FS_PEOPLE=')[0]+`const FS_PEOPLE=${JSON.stringify(people)};const FS_SONGS=${JSON.stringify(songs)};`;
 vm.runInContext(source,context);
 return {api:context.fiveStarsApi,rows,requestedSheets};
}
test('Google storage enforces limits and identity, preserves seen and returns weighted shared stats',()=>{const f=fixture();assert.throws(()=>f.api('session',{person:'gone'}));assert.throws(()=>f.api('vote',{person:'a',song:'s15',value:1}));for(let i=0;i<10;i++)f.api('vote',{person:'a',song:'s'+i,value:1});f.api('vote',{person:'a',song:'s10',value:1});for(let i=10;i<13;i++)f.api('vote',{person:'a',song:'s'+i,value:3});assert.throws(()=>f.api('vote',{person:'a',song:'s13',value:3}),/3/);f.api('seen',{person:'a',songs:['s0','s0','bad']});assert.equal(f.api('state',{person:'a'}).seen.length,1);const shared=f.api('stats',{});assert.equal(shared.participants,1);assert.equal(shared.votes,13);assert.equal(shared.songs.find(s=>s.id==='s10').score,2);assert.equal(shared.songs.find(s=>s.id==='s0').score,1);f.api('vote',{person:'a',song:'s0',value:0});assert.equal(f.api('stats',{}).votes,12);assert.ok(Number(f.rows[0][3])>0);});
test('device draft import is atomic, idempotent and cannot overwrite shared choices',()=>{const f=fixture();const first=f.api('import',{person:'a',votes:{s0:3,s1:1,s15:3}});assert.equal(first.votes.s0,3);assert.equal(first.votes.s1,1);assert.equal(first.votes.s15,undefined);f.api('import',{person:'a',votes:{s0:1,s2:1}});assert.equal(f.api('state',{person:'a'}).votes.s0,3);assert.equal(f.api('state',{person:'a'}).votes.s2,undefined);});

test('test reset uses only the test worksheet and preserves the production API contract',()=>{const testDb=fixture('../backend/test-template.gs');testDb.api('vote',{person:'a',song:'s0',value:3});testDb.api('vote',{person:'a',song:'s1',value:1});testDb.api('seen',{person:'a',songs:['s0']});const reset=testDb.api('reset',{person:'a'});assert.equal(Object.keys(reset.votes).length,0);assert.equal(reset.seen.length,0);assert.equal(testDb.api('stats',{}).votes,0);assert.deepEqual([...testDb.requestedSheets],['בחירות האתר — ניסוי']);const live=fixture();live.api('vote',{person:'a',song:'s0',value:1});assert.throws(()=>live.api('reset',{person:'a'}));assert.equal(live.api('state',{person:'a'}).votes.s0,1);});

test('test Google batch save validates before writing, is idempotent and rejects stale overwrites',()=>{
 const f=fixture('../backend/test-template.gs');const votes=Object.fromEntries(Array.from({length:12},(_,i)=>['s'+i,1]));votes.s12=3;votes.s13=3;votes.s14=3;
 const saved=f.api('save',{person:'a',votes,baseVotes:{}});assert.equal(Object.keys(saved.votes).length,15);const revision=saved.revision;
 assert.equal(f.api('save',{person:'a',votes,baseVotes:{}}).revision,revision);
 f.api('seen',{person:'a',songs:['s0']});const next={...votes,s12:1};f.api('save',{person:'a',votes:next,baseVotes:votes});
 assert.throws(()=>f.api('save',{person:'a',votes,baseVotes:{}}),/מכשיר אחר/);
 for(const invalid of [{s0:1},{...votes,s0:9},{...votes,s15:1},{...votes,s0:3}])assert.throws(()=>f.api('save',{person:'a',votes:invalid,baseVotes:next}));
 assert.equal(f.api('state',{person:'a'}).votes.s12,1);assert.equal(f.api('state',{person:'a'}).seen.length,1);
});
test('30 Google participant saves retain weighted scores and voter details (simulated Apps Script services)',async()=>{
 const people=Array.from({length:30},(_,i)=>({id:'p'+i}));const songs=Array.from({length:15},(_,i)=>({id:'s'+i,people:['author']}));
 const f=fixture('../backend/test-template.gs',{people,songs});const votes=Object.fromEntries(songs.slice(0,12).map(s=>[s.id,1]));votes.s12=3;votes.s13=3;votes.s14=3;
 await Promise.all(people.map(async p=>f.api('save',{person:p.id,votes,baseVotes:{}})));
 const stats=f.api('stats',{});assert.equal(stats.participants,30);assert.equal(stats.votes,450);assert.equal(stats.songs[0].score,30);assert.equal(stats.songs[12].score,60);assert.equal(stats.songs[12].voters.length,30);
 assert.deepEqual([...f.requestedSheets],['בחירות האתר — ניסוי']);
});

for(const template of ['../backend/Code.gs','../backend/test-template.gs'])test('shared names append stable identities and preserve earlier votes: '+template,()=>{
 const f=fixture(template);f.api('vote',{person:'a',song:'s0',value:1});
 assert.equal(f.api('people',{}).people.length,3);
 const added=f.api('add-person',{name:'  New   Person  '});assert.equal(added.people.at(-1).name,'New Person');
 assert.equal(f.api('add-person',{name:'new person'}).person,added.person);
 assert.throws(()=>f.api('add-person',{name:'Gone'}),/הוסר/);
 for(const name of ['', '=formula', '<script>', 'x'.repeat(81)])assert.throws(()=>f.api('add-person',{name}));
 const state=f.api('session',{person:added.person});assert.equal(Object.keys(state.votes).length,0);
 f.api('vote',{person:added.person,song:'s0',value:1});assert.equal(f.api('state',{person:'a'}).votes.s0,1);
 assert.equal(f.api('stats',{}).songs[0].voters.length,2);
});

for(const template of ['../backend/Code.gs','../backend/test-template.gs'])test('catalog growth locates ballots by identity and never overwrites existing rows: '+template,()=>{
 const rows=[['a','{"0":3}','[1]',7,'before'],['u-existing','{"1":1}','[]',4,'before'],['b','{}','[]',0,'']];
 const people=[{id:'a',name:'Renamed A'},{id:'b',name:'B'},{id:'new',name:'Imported'},{id:'u-existing',name:'Existing addition'}];
 const f=fixture(template,{people,rows});
 assert.equal(f.api('state',{person:'u-existing'}).votes.s1,1);
 assert.equal(f.api('state',{person:'a'}).votes.s0,3);
 assert.equal(f.api('state',{person:'a'}).seen[0],'s1');
 f.api('session',{person:'new'});f.api('vote',{person:'new',song:'s0',value:1});
 assert.deepEqual(f.rows.slice(0,3),rows);
 assert.equal(f.rows[3][0],'new');
 assert.equal(f.api('stats',{}).votes,3);
 assert.equal(f.api('state',{person:'u-existing'}).revision,4);
});
