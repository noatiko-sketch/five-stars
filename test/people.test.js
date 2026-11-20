import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activePeople,personName,songNames,createPeopleClient} from '../public/people.js';
const catalog=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url)));
test('WhatsApp import retains all old voting identities and song positions',()=>{
 const fingerprint=ids=>createHash('sha256').update(ids.join('\n')).digest('hex');
 assert.equal(fingerprint(catalog.people.slice(0,72).map(p=>p.id)),"0e54eda9e66f3782821d5af1f7cf0116e22ffee5c1c01d75454eda05e53c2d83");
 assert.equal(fingerprint(catalog.songs.slice(0,1219).map(s=>s.id)),"9ce739f2d7161c7a343d2562f4e9f1b287c205bd9a7f5622556ba5c74220ebd6");
 assert.equal(personName(catalog,'p58'),'רוני השחורה');
 assert.equal(personName(catalog,'p59'),'רוני הלבנה');
 assert.equal(new Set(catalog.people.map(p=>p.id)).size,catalog.people.length);
 assert.equal(new Set(catalog.songs.map(s=>s.id)).size,catalog.songs.length);
 for(const song of catalog.songs){assert.ok(song.title);assert.ok(song.url);assert.ok(song.shares.length);for(const share of song.shares)assert.ok(catalog.people.some(p=>p.id===share.person));}
 for(const person of catalog.people.slice(72))assert.ok(catalog.songs.some(s=>s.shares.some(x=>x.person===person.id)));
});
test('one directory supplies login, author labels, filters and voter details, including future identities',async()=>{
 const people=[...catalog.people,{id:'u-future',name:'שם חדש'}];const calls=[];
 const client=createPeopleClient(async(path,body)=>{calls.push({path,body});return path==='people'?{people:catalog.people}:{people,person:'u-future'};},catalog.people);
 await client.load();assert.equal(client.supported,true);const result=await client.add('שם חדש');
 const updated={...catalog,people:result.people};assert.equal(activePeople(updated).at(-1).id,'u-future');assert.equal(personName(updated,'u-future'),'שם חדש');assert.equal(songNames(updated,{shares:[{person:'u-future'}]}),'שם חדש');assert.equal(calls.at(-1).path,'add-person');
});
test('old deployed backend keeps approved names usable and hides unsupported add-name functionality',async()=>{
 const client=createPeopleClient(async()=>{throw Error('פעולה לא נתמכת');},catalog.people);assert.deepEqual(await client.load(),catalog.people);assert.equal(client.supported,false);await assert.rejects(client.add('שם'),/לא הופעלה/);
});
