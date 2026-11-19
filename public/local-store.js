import {validateBallot,sameVotes} from './ballot.js';
// Static Pages storage. Separate sandbox namespace; no shared production database.
export function createLocalStore(catalog, storage, namespace) {
 const key=`five-stars:${namespace}:v1`;
 const read=()=>JSON.parse(storage.getItem(key)||'{"people":{},"reviews":{}}');
 const write=data=>storage.setItem(key,JSON.stringify(data));
 const personState=(data,person)=>{const p=data.people[person]||{votes:{},seen:[]};return {person,...p,total:catalog.songs.length,unlocked:p.seen.length===catalog.songs.length,revision:data.revision||0};};
 return {
  state(person){return personState(read(),person);},
  mutate(person,path,body){const data=read();const p=data.people[person] ||= {votes:{},seen:[]};
   if(path==='vote'){
    const song=catalog.songs.find(s=>s.id===body.song);
    if(!song||![0,1,3].includes(body.value))throw new Error('בחירה לא תקינה');
    if(song.shares.some(s=>s.person===person))throw new Error('אי אפשר להצביע לשיר שלך');
    if(body.value===3&&p.votes[body.song]!==3&&Object.values(p.votes).filter(v=>v===3).length>=3)throw new Error('אפשר לבחור עד 3 שירים בממש אהבתי');
    if(body.value)p.votes[body.song]=body.value;else delete p.votes[body.song];
   } else if(path==='save'){
    validateBallot(catalog,person,body.votes);
    if(!sameVotes(p.votes,body.votes)&&(!body.baseVotes||!sameVotes(p.votes,body.baseVotes)))throw new Error('הבחירות השתנו במכשיר אחר. רעננו לפני השמירה');
    p.votes={...body.votes};
   } else if(path==='seen') p.seen=[...new Set([...p.seen,...body.songs.filter(id=>catalog.songs.some(s=>s.id===id))])];
   else throw new Error('פעולה לא תקינה');
   data.revision=(data.revision||0)+1;write(data);return personState(data,person);
  },
  stats(person,admin=false){const data=read();if(!admin&&!personState(data,person).unlocked)throw new Error('התוצאות ייפתחו אחרי מעבר על כל השירים');
   const songs=catalog.songs.map(s=>{const voters=Object.entries(data.people).filter(([,p])=>p.votes[s.id]).map(([person,p])=>({person,value:p.votes[s.id]}));return {id:s.id,score:voters.reduce((n,v)=>n+(v.value===3?2:1),0),likes:voters.filter(v=>v.value===1).length,loves:voters.filter(v=>v.value===3).length,voters};}).sort((a,b)=>b.score-a.score);
   const scores=new Map(catalog.people.map(p=>[p.id,0]));const songById=new Map(catalog.songs.map(s=>[s.id,s]));for(const result of songs)for(const id of new Set(songById.get(result.id).shares.map(x=>x.person)))scores.set(id,(scores.get(id)||0)+result.score);const contributors=[...scores].map(([person,score])=>({person,score})).sort((a,b)=>b.score-a.score);
   return {songs,contributors,participants:Object.values(data.people).filter(p=>Object.keys(p.votes).length).length,votes:songs.reduce((n,s)=>n+s.voters.length,0)};
  },
  reviews(){return read().reviews;},
  review(person,value){const data=read();if(value.action==='keep')delete data.reviews[person];else data.reviews[person]=value;write(data);},
  reset(){storage.removeItem(key);}
 };
}
