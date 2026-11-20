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
test('votes and loves rank senders across songs, crediting each co-sender only once',()=>{
 const results=[{id:'s0',score:4,likes:2,loves:1},{id:'s1',score:4,likes:0,loves:2}];
 const byVotes=rankContributors(catalog,results,'votes');
 assert.deepEqual(byVotes.map(p=>[p.person,p.score,p.votes,p.loves]),[['b',8,5,3],['a',4,3,1],['c',0,0,0]]);
 const byLoves=rankContributors(catalog,results,'loves');
 assert.deepEqual(byLoves.map(p=>[p.person,p.loves]),[['b',3],['a',1],['c',0]]);
});
test('the chosen metric changes ordering independently of points',()=>{
 const source={people:[{id:'a',name:'A'},{id:'b',name:'B'}],songs:[{id:'x',shares:[{person:'a'}]},{id:'y',shares:[{person:'b'}]}]};
 const results=[{id:'x',score:4,likes:4,loves:0},{id:'y',score:4,likes:0,loves:2}];
 assert.equal(rankContributors(source,results,'votes')[0].person,'a');
 assert.equal(rankContributors(source,results,'loves')[0].person,'b');
});
