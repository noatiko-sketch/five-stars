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
 if(values.filter(v=>v===3).length>3)throw new Error('אפשר לבחור עד 3 שירים בממש אהבתי');
}
export function createDraft(storage,key,person,votes){
 let base={...votes},current={...votes};
 try{const saved=JSON.parse(storage.getItem(key)||'null');if(saved?.person===person&&saved.base&&saved.votes){base=saved.base;current=saved.votes;}}catch{}
 const persist=()=>{if(sameVotes(base,current))storage.removeItem(key);else storage.setItem(key,JSON.stringify({person,base,votes:current}));};
 return {
  get votes(){return {...current};},get baseVotes(){return {...base};},get dirty(){return !sameVotes(base,current);},
  choose(id,value){const next=current[id]===value?0:value;if(next===3&&Object.values(current).filter(v=>v===3).length>=3)throw new Error('אפשר לבחור עד 3 שירים בממש אהבתי');if(next)current[id]=next;else delete current[id];persist();},
  receive(votes){if(!this.dirty){base={...votes};current={...votes};}else if(sameVotes(current,votes)){base={...votes};}persist();},
  saved(votes){base={...votes};current={...votes};persist();},
  clear(){storage.removeItem(key);base={};current={};}
 };
}
