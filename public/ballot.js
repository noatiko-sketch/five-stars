export const sameVotes=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
export function validateBallot(catalog,person,votes){
 if(!votes||typeof votes!=='object'||Array.isArray(votes))throw new Error('בחירה לא תקינה');
 const songs=new Map(catalog.songs.map(s=>[s.id,s]));
 for(const [id,value] of Object.entries(votes)){
  if(!songs.has(id)||![1,3].includes(value))throw new Error('בחירה לא תקינה');
  if(songs.get(id).shares.some(s=>s.person===person))throw new Error('אי אפשר להצביע לשיר שלך');
 }
 const values=Object.values(votes);
 if(values.filter(v=>v===1).length<10)throw new Error('צריך לבחור לפחות 10 שירים באהבתי');
 if(values.filter(v=>v===3).length>5)throw new Error('אפשר לבחור עד 5 שירים בממש אהבתי');
}
export function createDraft(storage,key,person,votes){
 let base={...votes},current={...votes},pendingSong;
 try{const saved=JSON.parse(storage.getItem(key)||'null');if(saved?.person===person&&saved.base&&saved.votes){base=saved.base;current=saved.votes;pendingSong=saved.pendingSong;}}catch{}
 const persist=()=>{if(sameVotes(base,current)&&!pendingSong)storage.removeItem(key);else storage.setItem(key,JSON.stringify({person,base,votes:current,pendingSong}));};
 return {
  get votes(){return {...current};},get baseVotes(){return {...base};},get pendingSong(){return pendingSong;},get dirty(){return !!pendingSong||!sameVotes(base,current);},
  choose(id,value){const next=current[id]===value?0:value;if(next===3&&Object.values(current).filter(v=>v===3).length>=5)throw new Error('אפשר לבחור עד 5 שירים בממש אהבתי');if(next)current[id]=next;else delete current[id];persist();},
  receive(votes){if(!this.dirty){base={...votes};current={...votes};}else if(sameVotes(current,votes)){base={...votes};}persist();},
  writing(id){pendingSong=id;persist();},
  acknowledge(votes){const changed=new Set([...Object.keys(base),...Object.keys(current)].filter(id=>base[id]!==current[id]));if(pendingSong)changed.add(pendingSong);const merged={...votes};for(const id of changed){if(current[id])merged[id]=current[id];else delete merged[id];}pendingSong=undefined;base={...votes};current=merged;persist();},
  saved(votes){pendingSong=undefined;base={...votes};current={...votes};persist();},
  clear(){pendingSong=undefined;storage.removeItem(key);base={};current={};}
 };
}

// Only one write at a time. Each write is absolute and safe to retry after a timeout.
export function createAutoSave(draft,write,{changed=()=>{},schedule=setTimeout,cancel=clearTimeout,delay=500,retryDelay=10000}={}){
 let timer,running=null,stopped=false,lastError=null;
 const notify=()=>changed({pending:draft.dirty,running:!!running,error:lastError});
 function queue(wait=delay){if(stopped)return;cancel(timer);timer=schedule(()=>{timer=null;flush().catch(()=>{});},wait);}
 async function drain(){
  while(!stopped&&draft.dirty){
   const base=draft.baseVotes,votes=draft.votes;
   // Free a love slot before assigning it to another song.
   const ids=[...new Set([...Object.keys(base),...Object.keys(votes)])].filter(id=>base[id]!==votes[id]).sort((a,b)=>(votes[a]===3?1:0)-(votes[b]===3?1:0));
   const id=draft.pendingSong||ids[0];if(!id)break;
   draft.writing(id);const result=await write({song:id,value:votes[id]||0});
   draft.acknowledge(result.votes);lastError=null;notify();
  }
 }
 function flush(){
  cancel(timer);timer=null;
  if(running)return running;
  if(stopped||!draft.dirty)return Promise.resolve();
  running=Promise.resolve().then(drain).catch(error=>{lastError=error;queue(retryDelay);throw error;}).finally(()=>{running=null;notify();});notify();return running;
 }
 return {get pending(){return draft.dirty;},get running(){return !!running;},queue,flush,stop(){stopped=true;cancel(timer);}};
}

export function receivedVotes(catalog,person,stats){
 const own=new Set(catalog.songs.filter(s=>s.shares.some(x=>x.person===person)).map(s=>s.id));
 return stats.songs.filter(s=>own.has(s.id)).reduce((n,s)=>n+(s.voters?.length??((s.likes||0)+(s.loves||0))),0);
}
