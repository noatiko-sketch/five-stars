import { connectGoogleStore } from '../google-store.js';
import { createLocalStore } from '../local-store.js';
import {createPeopleClient,personName,songNames,activePeople} from '../people.js';
import {rankContributors} from '../rankings.js';
const sandbox=globalThis.FIVE_STARS_SANDBOX===true;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ranking=document.querySelector('#stats-ranking');
const description=document.querySelector('.ranking-description');
const dialog=document.querySelector('#voter-dialog');
const shared=globalThis.FIVE_STARS_STORAGE_URL?connectGoogleStore(globalThis.FIVE_STARS_STORAGE_URL):null;
let latestStats,refreshSequence=0,refreshing=false;
let catalog,store,sort='score',rankingType='songs',sender='',limit=50;
const metricLabel=()=>sort==='score'?'כוכבים':sort==='votes'?'הצבעות':'ממש אהבתי';
const metric=r=>sort==='score'?r.score:sort==='votes'?(r.votes??((r.likes||0)+(r.loves||0))):r.loves;
const name=id=>personName(catalog,id)||'משתתף שהוסר';
const rankingDescriptions={
 score:'כוכבים',
 votes:'הצבעות',
 loves:'הצבעות ״ממש אהבתי״',
};
const currentStats=()=>latestStats||store.stats(null,true);

function render(){
 const subject=rankingType==='people'?'חברי הקבוצה שהשירים שלהם קיבלו':'השירים שקיבלו';
 description.textContent=`דירוג ${subject} הכי הרבה ${rankingDescriptions[sort]}`;
 if(shared&&!latestStats)return;
 const all=currentStats();
 if(rankingType==='people'){
  const people=rankContributors(catalog,all.songs,sort).filter(p=>!sender||p.person===sender);
  ranking.innerHTML=people.slice(0,limit).map((p,i)=>`<button class="ranking-card" data-person="${escape(p.person)}" aria-label="${escape(p.name)} — פירוט הצבעות"><span class="rank">${i+1}</span><span class="text"><strong class="contributor-name">${escape(p.name)}</strong></span><span class="score">${metric(p)}<small>${metricLabel()}</small></span></button>`).join('')||'<p class="empty">אין משתתפים להצגה</p>';
  ranking.querySelectorAll('[data-person]').forEach(button=>button.onclick=()=>openContributor(button.dataset.person));
  addMore(people.length,'עוד משתתפים');return;
 }
 const byId=new Map(all.songs.map(s=>[s.id,s]));
 const rows=catalog.songs.filter(s=>!sender||s.shares.some(x=>x.person===sender)).map(song=>({song,id:song.id,score:0,likes:0,loves:0,voters:[],...byId.get(song.id)})).filter(r=>sender||r.voters.length);
 rows.sort((a,b)=>metric(b)-metric(a)||b.score-a.score||a.song.title.localeCompare(b.song.title,'he'));
 ranking.innerHTML=rows.length?rows.slice(0,limit).map((r,i)=>`<button class="ranking-card" data-song="${escape(r.id)}" aria-label="${escape(r.song.title)} — פירוט הצבעות"><span class="rank">${i+1}</span>${r.song.image?`<img class="art" src="${escape(r.song.image)}" alt="" loading="lazy" decoding="async">`:'<span class="art"></span>'}<span class="text"><span class="title" dir="auto">${escape(r.song.title)}</span><span class="artist" dir="auto">${escape(r.song.artist)}</span><span class="sender">${escape(songNames(catalog,r.song))}</span></span><span class="score">${metric(r)}<small>${metricLabel()}</small></span></button>`).join(''):`<div class="empty">${shared?'עדיין אין הצבעות.':'עדיין אין בחירות בדפדפן הזה.'}</div>`;
 addMore(rows.length,'עוד שירים');
 ranking.querySelectorAll('[data-song]').forEach(button=>button.onclick=()=>openSong(button.dataset.song));
}
function addMore(count,label){if(count<=limit)return;const button=document.createElement('button');button.className='more';button.textContent=label;button.onclick=()=>{limit+=50;render();};ranking.append(button);}
function voteRow(vote,showStars=false){
 const isLove=vote.value===3;
 const label=isLove?'ממש אהבתי':'אהבתי';
 const stars=isLove?'2 כוכבים':'כוכב אחד';
 return `<div class="modal-row"><span>${escape(name(vote.person))}</span><span class="vote-tag ${isLove?'love':'like'}">${label}${showStars?` · ${stars}`:''}</span></div>`;
}

function openVoterDialog(title,body,actions=''){
 dialog.innerHTML=`<h2 id="voter-dialog-title" dir="auto">${escape(title)}</h2>${body}<div class="dialog-actions">${actions}<button class="close">סגירה</button></div>`;
 dialog.querySelector('.close').onclick=()=>dialog.close();
 dialog.showModal();
}

function openSong(id){
 const song=catalog.songs.find(s=>s.id===id);
 const result=currentStats().songs.find(s=>s.id===id)||{score:0,voters:[]};
 const votes=result.voters.map(vote=>voteRow(vote)).join('')||'<p class="note">עדיין אין הצבעות לשיר הזה</p>';
 openVoterDialog(song.title,`<p class="artist" dir="auto">${escape(song.artist)}</p><p>${result.score} כוכבים · ${result.voters.length} אנשים</p><div class="modal-list">${votes}</div>`,`<a class="identity" href="${escape(song.url)}" target="_blank" rel="noopener noreferrer">האזנה לשיר ↗</a>`);
}

function openContributor(id){
 const sharedSongs=new Map(catalog.songs.filter(song=>song.shares.some(share=>share.person===id)).map(song=>[song.id,song]));
 const songs=currentStats().songs.filter(result=>sharedSongs.has(result.id)&&result.voters?.length);
 songs.sort((a,b)=>metric(b)-metric(a)||b.score-a.score||sharedSongs.get(a.id).title.localeCompare(sharedSongs.get(b.id).title,'he'));
 const details=songs.map(result=>{
  const song=sharedSongs.get(result.id);
  return `<section class="contributor-song"><h3 dir="auto">${escape(song.title)}</h3><p class="artist" dir="auto">${escape(song.artist)}</p>${result.voters.map(vote=>voteRow(vote,true)).join('')}</section>`;
 }).join('')||'<p class="note">עדיין אין הצבעות לשירים ששיתפת</p>';
 openVoterDialog(name(id),`<div class="modal-list">${details}</div>`);
}
async function start(){if(sandbox)document.querySelector('.score-key').insertAdjacentHTML('beforebegin','<p class="local-notice">סביבת ניסוי · נתונים נפרדים</p>');try{const r=await fetch('../catalog.json');if(!r.ok)throw new Error('catalog');catalog=await r.json();catalog.people=await createPeopleClient(shared,catalog.people).load();if(!shared)store=createLocalStore(catalog,localStorage,sandbox?'sandbox':'live-local');const filter=document.querySelector('#stats-sender');filter.insertAdjacentHTML('beforeend',activePeople(catalog).map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join(''));filter.onchange=()=>{sender=filter.value;limit=50;render();};document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{if(sort!==b.dataset.sort){sender='';filter.value='';}sort=b.dataset.sort;limit=50;document.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});document.querySelectorAll('[data-ranking-type]').forEach(b=>b.onclick=()=>{if(rankingType!==b.dataset.rankingType){sender='';filter.value='';}rankingType=b.dataset.rankingType;filter.closest('.sender-filter').hidden=rankingType!=='songs';limit=50;document.querySelectorAll('[data-ranking-type]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});if(shared)await refresh();else render();}catch{ranking.innerHTML='<p class="empty">לא הצלחנו לטעון את הנתונים. נסו לרענן.</p>';}finally{refreshing=false;}}
async function refresh(){if(!shared||refreshing)return;refreshing=true;if(!latestStats)ranking.innerHTML='<p class="empty">טוענים את הבחירות…</p>';const sequence=++refreshSequence;try{const next=await shared('stats',{});if(sequence!==refreshSequence)return;latestStats=next;render();}catch{if(!latestStats)ranking.innerHTML='<p class="empty">לא הצלחנו לטעון את הבחירות. נסו לרענן.</p>';}finally{refreshing=false;}}
window.addEventListener('storage',()=>{if(store)render();});
setInterval(()=>{if(!document.hidden&&catalog&&shared)refresh();},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&catalog){if(shared)refresh();else render();}});
start();
