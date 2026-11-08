import { createLocalStore } from '../local-store.js';
const sandbox=globalThis.FIVE_STARS_SANDBOX===true;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ranking=document.querySelector('#stats-ranking');
const dialog=document.querySelector('#voter-dialog');
let catalog,store,sort='score',sender='',limit=50;
const name=id=>catalog.people.find(p=>p.id===id)?.name||id;
function render(){
 const all=store.stats(null,true);
 const byId=new Map(all.songs.map(s=>[s.id,s]));
 const rows=catalog.songs.filter(s=>!sender||s.shares.some(x=>x.person===sender)).map(song=>({song,...byId.get(song.id)})).filter(r=>sender||r.voters.length);
 const metric=r=>sort==='loves'?r.loves:sort==='people'?r.voters.length:r.score;
 rows.sort((a,b)=>metric(b)-metric(a)||b.score-a.score||a.song.title.localeCompare(b.song.title,'he'));
 const voters=new Set(rows.flatMap(r=>r.voters.map(v=>v.person)));
 document.querySelector('#metrics').innerHTML=`<div class="metric"><strong>${rows.filter(r=>r.voters.length).length}</strong><span>שירים אהובים</span></div><div class="metric"><strong>${voters.size}</strong><span>מצביעים</span></div><div class="metric"><strong>${rows.reduce((n,r)=>n+r.score,0)}</strong><span>נקודות</span></div>`;
 ranking.innerHTML=rows.length?rows.slice(0,limit).map((r,i)=>`<button class="ranking-card" data-song="${escape(r.id)}" aria-label="${escape(r.song.title)} — פירוט הצבעות"><span class="rank">${i+1}</span>${r.song.image?`<img class="art" src="${escape(r.song.image)}" alt="" loading="lazy" decoding="async">`:'<span class="art"></span>'}<span class="text"><span class="title" dir="auto">${escape(r.song.title)}</span><span class="artist" dir="auto">${escape(r.song.artist)}</span><span class="sender">${escape([...new Set(r.song.shares.map(x=>name(x.person)))].join(' · '))}</span><span class="vote-breakdown">${r.loves} ממש אהבתי · ${r.likes} אהבתי · ${r.voters.length} אנשים</span></span><span class="score">${metric(r)}<small>${sort==='score'?'נקודות':sort==='loves'?'ממש אהבתי':'אנשים'}</small></span></button>`).join(''):'<div class="empty">עדיין אין בחירות בדפדפן הזה.<br><a href="../">לבחירת שירים ↗</a></div>';
 if(rows.length>limit)ranking.insertAdjacentHTML('beforeend','<button class="more" id="more-stats">עוד שירים</button>');
 document.querySelector('#more-stats')?.addEventListener('click',()=>{limit+=50;render();});
 ranking.querySelectorAll('[data-song]').forEach(button=>button.onclick=()=>openSong(button.dataset.song));
}
function openSong(id){
 const song=catalog.songs.find(s=>s.id===id);
 const result=store.stats(null,true).songs.find(s=>s.id===id);
 dialog.innerHTML=`<h2 dir="auto">${escape(song.title)}</h2><p class="artist" dir="auto">${escape(song.artist)}</p><p>${result.score} נקודות · ${result.voters.length} אנשים</p><div class="modal-list">${result.voters.length?result.voters.map(v=>`<div class="modal-row"><span>${escape(name(v.person))}</span><span class="vote-tag ${v.value===3?'love':'like'}">${v.value===3?'ממש אהבתי':'אהבתי'}</span></div>`).join(''):'<p class="note">עדיין אין הצבעות לשיר הזה</p>'}</div><div class="dialog-actions"><a class="identity" href="${escape(song.url)}" target="_blank" rel="noopener noreferrer">האזנה לשיר ↗</a><button class="close">סגירה</button></div>`;
 dialog.querySelector('.close').onclick=()=>dialog.close();dialog.showModal();
}
async function start(){try{const r=await fetch('../catalog.json');if(!r.ok)throw new Error('catalog');catalog=await r.json();store=createLocalStore(catalog,localStorage,sandbox?'sandbox':'live-local');const filter=document.querySelector('#stats-sender');filter.insertAdjacentHTML('beforeend',catalog.people.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join(''));filter.onchange=()=>{sender=filter.value;limit=50;render();};document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sort=b.dataset.sort;limit=50;document.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});if(sandbox)document.querySelector('.local-notice').textContent='סביבת ניסויים · נתוני הדפדפן הזה בלבד';render();}catch{ranking.innerHTML='<p class="empty">לא הצלחנו לטעון את הנתונים. נסו לרענן.</p>';}}
window.addEventListener('storage',()=>{if(store)render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&store)render();});
start();
