import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraft,createAutoSave,receivedVotes} from '../public/ballot.js';
import {createIdentity} from '../public/identity.js';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const options={schedule:()=>0,cancel:()=>{}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('slow database writes never block choices and preserve changes during a request',async()=>{
 const draft=createDraft(memory(),'a','a',{}),gate=deferred();let remote={},calls=0;
 const save=createAutoSave(draft,async({song,value})=>{if(++calls===1)await gate.promise;if(value)remote[song]=value;else delete remote[song];return{votes:{...remote}};},options);
 draft.choose('s0',1);const saving=save.flush();await Promise.resolve();
 draft.choose('s1',3);draft.choose('s0',1);draft.choose('s2',1);
 assert.deepEqual(draft.votes,{s1:3,s2:1});gate.resolve();await saving;
 assert.deepEqual(remote,draft.votes);assert.equal(draft.dirty,false);assert.equal(save.running,false);
});
test('an ambiguous failed write and an undo survive a reload and retry without duplicates',async()=>{
 const storage=memory();let draft=createDraft(storage,'a','a',{}),remote={};const gate=deferred();
 let save=createAutoSave(draft,async({song,value})=>{remote[song]=value;await gate.promise;throw Error('offline');},options);
 draft.choose('s0',1);const saving=save.flush();await Promise.resolve();draft.choose('s0',1);
 // The server may have committed while the user closed the page.
 assert.deepEqual(remote,{s0:1});draft=createDraft(storage,'a','a',remote);assert.deepEqual(draft.votes,{});assert.equal(draft.dirty,true);
 gate.resolve();await assert.rejects(saving,/offline/);save.stop();
 save=createAutoSave(draft,async({song,value})=>{if(value)remote[song]=value;else delete remote[song];return{votes:{...remote}};},options);
 await save.flush();assert.deepEqual(remote,{});assert.equal(draft.dirty,false);
});
test('love replacement releases the old slot first and preserves other-device additions',async()=>{
 const draft=createDraft(memory(),'a','a',{s0:3,s1:3,s2:3});let remote={s0:3,s1:3,s2:3};const calls=[];
 draft.choose('s0',3);draft.choose('s3',3);
 const save=createAutoSave(draft,async({song,value})=>{calls.push({song,value});remote.extra=1;if(value)remote[song]=value;else delete remote[song];assert.ok(Object.values(remote).filter(v=>v===3).length<=3);return{votes:{...remote}};},options);
 await save.flush();assert.deepEqual(calls,[{song:'s0',value:0},{song:'s3',value:3}]);assert.deepEqual(draft.votes,{s1:3,s2:3,s3:3,extra:1});
});
test('offline drafts resume without final save and partial ballots need no ten-song minimum',async()=>{
 const storage=memory();let draft=createDraft(storage,'a','a',{});draft.choose('s0',1);draft=createDraft(storage,'a','a',{});
 let stored;const save=createAutoSave(draft,async body=>{stored=body;return{votes:{[body.song]:body.value}};},options);await save.flush();assert.deepEqual(stored,{song:'s0',value:1});assert.equal(storage.getItem('a'),undefined);
});
test('rapid choices coalesce into the latest intended value with one active writer',async()=>{
 const draft=createDraft(memory(),'a','a',{});let active=0,max=0,calls=0;
 const save=createAutoSave(draft,async body=>{max=Math.max(max,++active);await Promise.resolve();active--;calls++;return{votes:{[body.song]:body.value}};},options);
 draft.choose('s0',1);draft.choose('s0',1);draft.choose('s0',3);await Promise.all([save.flush(),save.flush()]);assert.equal(max,1);assert.equal(calls,1);assert.deepEqual(draft.votes,{s0:3});
});
test('received counter counts song votes, not points, with duplicate and shared authors',()=>{
 const catalog={songs:[{id:'s0',shares:[{person:'a'},{person:'a'},{person:'b'}]},{id:'s1',shares:[{person:'a'}]},{id:'s2',shares:[{person:'b'}]}]};
 const stats={songs:[{id:'s0',score:5,voters:[{person:'x',value:3},{person:'y',value:3},{person:'z',value:1}]},{id:'s1',likes:2,loves:1},{id:'s2',voters:[{person:'x',value:1}]}]};
 assert.equal(receivedVotes(catalog,'a',stats),6);assert.equal(receivedVotes(catalog,'b',stats),4);assert.equal(receivedVotes(catalog,'new',stats),0);
});
test('identity survives reopening, uses cookie fallback and keeps production and test separate',()=>{
 const storage=memory(),doc={cookie:''};const identity=createIdentity(storage,doc);identity.set('a');assert.equal(createIdentity(storage,doc).get(),'a');assert.match(doc.cookie,/Max-Age=31536000/);
 assert.equal(createIdentity(memory(),doc).get(),'a');assert.equal(createIdentity(storage,doc,true).get(),'');
 const testDoc={cookie:''};createIdentity(storage,testDoc,true).set('b');assert.equal(identity.get(),'a');assert.equal(createIdentity(storage,testDoc,true).get(),'b');identity.clear();assert.match(doc.cookie,/Max-Age=0/);
});
