// Credit a shared song once to each active sender, using the same points as song rankings.
export function rankContributors(catalog,results,metric='score'){
 const scores=new Map(catalog.people.filter(p=>p.active!==false).map(p=>[p.id,{person:p.id,name:p.name,score:0,votes:0,loves:0}]));
 const bySong=new Map(catalog.songs.map(s=>[s.id,s]));
 for(const result of results){const song=bySong.get(result.id);if(!song)continue;
  for(const person of new Set(song.shares.map(s=>s.person))){const row=scores.get(person);if(row){row.score+=result.score||0;row.votes+=(result.likes||0)+(result.loves||0);row.loves+=result.loves||0;}}
 }
 return [...scores.values()].sort((a,b)=>b[metric]-a[metric]||b.score-a.score||a.name.localeCompare(b.name,'he')||a.person.localeCompare(b.person));
}
