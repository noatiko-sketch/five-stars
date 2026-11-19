import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activePeople,personName,songNames,createPeopleClient} from '../public/people.js';
const catalog=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url)));
const renamed={p7:'אוהד',p11:'אורי מרגלית',p20:'בנו',p21:'בתיה',p24:'איתמר',p39:'אופיר כהן',p41:'מיכל',p43:'נדב ריבקין',p44:'נועה ליברמן',p51:'אמיר',p53:'עדן',p56:'עמר בן אביב',p57:'קשת',p58:'רוני אליאסיאן',p59:'רוני וקסלר',p62:'רועי דהוקי',p65:'שני',p71:'תמר קוה'};
const removed=['p0','p5','p8','p12','p17','p18','p23','p26','p31','p33','p34','p36','p37','p38','p40','p42','p45','p68','p70'];
test('approved original mapping: 18 renames and 19 retired identities retain song ownership',()=>{
 assert.equal(catalog.people.length,72);assert.equal(activePeople(catalog).length,53);
 for(const [id,name]of Object.entries(renamed)){assert.equal(personName(catalog,id),name);assert.ok(catalog.songs.some(s=>s.shares.some(x=>x.person===id)));}
 for(const id of removed){assert.equal(personName(catalog,id),'');assert.equal(catalog.people.find(p=>p.id===id).active,false);}
 for(const s of catalog.songs)for(const share of s.shares)assert.ok(catalog.people.some(p=>p.id===share.person));
 assert.equal(songNames(catalog,{shares:[{person:'p7'},{person:'p11'},{person:'p7'},{person:'p0'}]}),'אוהד · אורי מרגלית');
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
