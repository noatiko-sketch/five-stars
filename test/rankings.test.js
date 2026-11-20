import test from 'node:test';
import assert from 'node:assert/strict';
import {rankContributors} from '../public/rankings.js';
const catalog={people:[{id:'a',name:'אביגיל'},{id:'b',name:'בתיה'},{id:'c',name:'גיל'},{id:'retired',name:'הוסר',active:false}],songs:[{id:'s0',shares:[{person:'a'},{person:'a'},{person:'b'}]},{id:'s1',shares:[{person:'b'},{person:'retired'}]}]};
test('contributor leaderboard credits points once per sender and ranks points descending',()=>{
 const result=rankContributors(catalog,[{id:'s0',score:5},{id:'s1',score:7},{id:'unknown',score:100}]);
 assert.deepEqual(result.map(p=>[p.person,p.score]),[['b',12],['a',5],['c',0]]);
});
test('unvoted and future participants remain eligible; ties have a stable name order',()=>{
 const source={...catalog,people:[...catalog.people,{id:'new',name:'דנה'}]};
 assert.deepEqual(rankContributors(source,[]).map(p=>[p.person,p.score]),[['a',0],['b',0],['c',0],['new',0]]);
 assert.equal(catalog.people[0].score,undefined);
});
