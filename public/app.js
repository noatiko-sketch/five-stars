import { connectGoogleStore } from './google-store.js';
import { createLocalStore } from './local-store.js';
import { createDraft, validateBallot } from './ballot.js';
const previewMode = globalThis.FIVE_STARS_PREVIEW === true;
const sandbox = globalThis.FIVE_STARS_SANDBOX === true;
let localStore;
const googleRequest = globalThis.FIVE_STARS_STORAGE_URL ? connectGoogleStore(globalThis.FIVE_STARS_STORAGE_URL) : null;
const sharedIdentityKey=sandbox?'five-stars:identity:shared-test':'five-stars:identity:shared';
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let catalog, state, tab = 'songs', stats, statsView = 'songs', statsLimit = 50, busy = false;
let query = '', sender = '', month = '', observer, noticeTimer, seenTimer;
const queuedSeen = new Set();
const viewed = new Set();
let draft, savingBallot=false, savedMessage='';
const draftKey=person=>`five-stars:draft:${sandbox?'test':'live'}:${person}`;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString('he-IL');
const selectablePeople = () => catalog.people.filter(p=>p.active!==false);
const personName = id => selectablePeople().find(p => p.id === id)?.name || '';
async function api(path, body) {
  if (previewMode) {
    if (path === 'catalog') {
      const response = await fetch('./catalog.json');
      if (!response.ok) throw new Error('לא הצלחנו לטעון את השירים');
      return response.json();
    }
    if(googleRequest){
      const person=body?.person||state?.person||localStorage.getItem(sharedIdentityKey);
      if(!person||!catalog.people.some(p=>p.id===person&&p.active!==false))throw Object.assign(new Error('יש לבחור שם'),{status:401});
      let result=await googleRequest(path,{...body,person});
      if(!sandbox&&path==='session'&&Object.keys(result.votes).length===0){
       try{const prior=JSON.parse(localStorage.getItem('five-stars:live-local:v1')||'{}').people?.[person]?.votes;if(prior&&Object.keys(prior).length)result=await googleRequest('import',{person,votes:prior});}catch{notice('הבחירות המקומיות נשארו במכשיר; אפשר לבדוק אותן בהמשך');}
      }
      if(path==='session')localStorage.setItem(sharedIdentityKey,person);
      return result;
    }
    localStore ||= createLocalStore(catalog, localStorage, sandbox?'sandbox':'live-local');
    if (path === 'session') {localStorage.setItem(`five-stars:identity:${sandbox?'sandbox':'live-local'}`,body.person);return localStore.state(body.person);}
    if (!state) {const person=localStorage.getItem(`five-stars:identity:${sandbox?'sandbox':'live-local'}`);if(path==='state'&&selectablePeople().some(p=>p.id===person))return localStore.state(person);throw Object.assign(new Error('יש לבחור שם'), {status:401});}
    if (path === 'state') return localStore.state(state.person);
    if (path === 'stats') return Promise.reject(new Error('הסטטיסטיקות אינן זמינות כרגע'));
    return localStore.mutate(state.person,path,body);
  }
  const response = await fetch(`/api/${path}`, { method:body ? 'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), {status:response.status});
  return result;
}
function notice(text) { const node=document.querySelector('#notice');node.textContent=text;node.classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.classList.remove('visible'),4000); }
function modal(title, content) { dialog.innerHTML=`<h2>${escape(title)}</h2><div class="modal-list">${content}</div><button class="close">סגירה</button>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.showModal(); }
function setState(next) {
 if(state?.person===next.person && next.revision < state.revision)return;
 if(!draft||state?.person!==next.person)draft=createDraft(localStorage,draftKey(next.person),next.person,next.votes);
 else draft.receive(next.votes);
 state={...next,votes:draft.votes};next.seen.forEach(id=>viewed.add(id));updateProgress();
}
function updateSave(){const button=document.querySelector('#save-ballot');if(button){button.disabled=savingBallot||!draft?.dirty;button.textContent=savingBallot?'שומרים…':'שמירת הבחירות';}const status=document.querySelector('#ballot-status');if(status)status.textContent=draft?.dirty?'יש שינויים שלא נשמרו':savedMessage;}
async function saveBallot(){
 if(savingBallot||!draft?.dirty)return;
 try{validateBallot(catalog,state.person,draft.votes);}catch(e){notice(e.message);return;}
 savingBallot=true;updateSave();
 try{const next=await api('save',{votes:draft.votes,baseVotes:draft.baseVotes});draft.saved(next.votes);setState(next);savedMessage='נשמר';}
 catch(e){notice(e.message);savedMessage='';if(e.message.includes('מכשיר אחר')){modal('הבחירות השתנו במכשיר אחר','<button id="reload-ballot" class="person">טעינת הבחירות השמורות במקום הטיוטה</button>');dialog.querySelector('#reload-ballot').onclick=async()=>{try{const next=await api('state');draft.clear();draft=null;state=null;setState(next);dialog.close();render();}catch(error){notice(error.message);}};}}
 finally{savingBallot=false;updateSave();}
}
function updateProgress() {
  const label=document.querySelector('#progress-label');
  if(label) label.textContent=`${number(state.seen.length)} / ${number(state.total)}`;
  const fill=document.querySelector('.track i'); if(fill)fill.style.width=`${state.seen.length/state.total*100}%`;
  const results=document.querySelector('#stats-tab');if(results){results.classList.toggle('locked',!state.unlocked&&!sandbox);results.setAttribute('aria-disabled',String(!state.unlocked&&!sandbox));}
  const likes=document.querySelector('#like-count');if(likes)likes.textContent=`אהבתי · ${Object.values(state.votes).filter(v=>v===1).length} · לפחות 10`;
  updateSave();
  const loves=document.querySelector('#love-count');if(loves)loves.textContent=`ממש אהבתי · ${Object.values(state.votes).filter(v=>v===3).length} מתוך 3`;
}
function image(song) { return song.image ? `<img class="art" src="${escape(song.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''; }
function names(song){return [...new Set(song.shares.map(s=>personName(s.person)).filter(Boolean))].join(' · ') || 'מהקבוצה';}
function monthName(key){return new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric'}).format(new Date(key+'-02T12:00:00'));}
function renderLogin(){
  observer?.disconnect();
  app.innerHTML=`<section class="login"><div class="kicker">${sandbox?'סביבת ניסוי':'שירי מוצ״ש · חוגגים 2,000'}</div><h1>חמישה<br><span>כוכבים.</span></h1><h2>מי כאן?</h2><input id="name-search" aria-label="חיפוש השם שלי" placeholder="השם שלי"><div class="names"></div><p class="note">השם שבחרת יופיע לצד הבחירות שלך בסטטיסטיקות.</p></section>`;
  const namesNode=app.querySelector('.names');
  function list(q=''){namesNode.innerHTML=selectablePeople().filter(p=>p.name.includes(q)).map(p=>`<button class="person" data-person="${p.id}">${escape(p.name)}</button>`).join('') || '<p>לא נמצא שם</p>';namesNode.querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{setState(await api('session',{person:b.dataset.person}));viewed.clear();state.seen.forEach(id=>viewed.add(id));query='';sender='';month='';tab='songs';render();}catch(e){notice(e.message);b.disabled=false;}finally{busy=false;}});}
  app.querySelector('input').oninput=e=>list(e.target.value.trim());list();
}
function render(){
 observer?.disconnect();
 app.innerHTML=`<header><a class="brand" href="./">חמישה כוכבים.</a><button class="identity">${escape(personName(state.person))}</button></header><div class="sticky-status"><div class="vote-counters"><span id="like-count" role="status" aria-live="polite"></span><span id="love-count" role="status" aria-live="polite"></span></div>${previewMode?`<small>${sandbox?(googleRequest?'סביבת ניסוי · שמירה נפרדת':'סביבת ניסוי · נשמר במכשיר'):(googleRequest?'מחובר לשמירה':'נשמר במכשיר הזה בלבד · ללא סנכרון')}</small>`:''}${sandbox?'<button id="review-names">עריכת שמות</button><button id="test-reset">איפוס ניסוי</button>':''}</div><main class="wrap"><section class="hero"><h1 class="intro">${tab==='songs'?'תסמנו שירים שבזכות הקבוצה הכרתם' :'הכי הרבה<span>אהבה.</span>'}</h1><div class="count"><strong>${number(tab==='songs'?catalog.songs.length:stats?.participants||0)}</strong><small>${tab==='songs'?'שירים מהקבוצה':'משתתפים הצביעו'}</small></div></section><div id="content"></div></main>`;
 app.querySelector('.identity').onclick=()=>{if(savingBallot||busy||flushing){notice('רגע, שומרים');return;}queuedSeen.clear();viewed.clear();draft=null;clearTimeout(seenTimer);state=null;renderLogin();};

 if(sandbox){app.querySelector('#review-names').onclick=()=>{localStore ||= createLocalStore(catalog,localStorage,'sandbox');renderNameReview();};app.querySelector('#test-reset').onclick=()=>{modal('לאפס את נתוני הניסוי?', '<p>הצבעות הניסוי וההתקדמות של כל המשתתפים בטסט יימחקו.</p><button id="confirm-reset" class="person">איפוס</button>');dialog.querySelector('#confirm-reset').onclick=async()=>{if(savingBallot||busy||flushing){notice('רגע, שומרים');return;}busy=true;try{const person=state.person;queuedSeen.clear();viewed.clear();clearTimeout(seenTimer);if(googleRequest){const next=await api('reset',{});draft?.clear();draft=null;dialog.close();state=null;setState(next);}else{localStore.reset();draft?.clear();draft=null;dialog.close();state=null;setState(localStore.state(person));}render();notice('נתוני הניסוי אופסו');}catch(e){notice(e.message);}finally{busy=false;}};};}
 if(tab==='songs')renderSongs();else renderStats();updateProgress();
}
function renderSongs(){
 const months=[...new Set(catalog.songs.flatMap(s=>s.shares.map(x=>x.date.slice(0,7))))].sort();
 app.querySelector('#content').innerHTML=`<div class="toolbar"><input id="search" type="search" placeholder="איזה שיר?" aria-label="חיפוש שיר או אמן" value="${escape(query)}"><select id="sender" aria-label="סינון לפי משתף"><option value="">כולם</option>${selectablePeople().map(p=>`<option value="${p.id}" ${sender===p.id?'selected':''}>${escape(p.name)}</option>`).join('')}</select><select id="month" aria-label="סינון לפי חודש"><option value="">כל החודשים</option>${months.map(m=>`<option value="${m}" ${month===m?'selected':''}>${monthName(m)}</option>`).join('')}</select></div><div class="progress"><span id="progress-label"></span><div class="track"><i></i></div></div><div class="save-status" id="save-status"></div><div id="song-list"></div><div class="ballot-save"><span id="ballot-status" role="status"></span><button id="save-ballot" type="button">שמירת הבחירות</button></div>`;
 app.querySelector('#save-ballot').onclick=saveBallot;updateSave();
 app.querySelector('#search').oninput=e=>{query=e.target.value;listSongs();};app.querySelector('#sender').onchange=e=>{sender=e.target.value;listSongs();};app.querySelector('#month').onchange=e=>{month=e.target.value;listSongs();};listSongs();
}
function listSongs(){
 observer?.disconnect();
 const q=query.trim().toLocaleLowerCase();
 const groupMonth=s=>month||s.shares.filter(x=>!sender||x.person===sender).map(x=>x.date.slice(0,7)).sort()[0];
 const songs=catalog.songs.filter(s=>(!q||`${s.title} ${s.artist}`.toLocaleLowerCase().includes(q))&&s.shares.some(x=>(!sender||x.person===sender)&&(!month||x.date.startsWith(month)))).sort((a,b)=>groupMonth(a).localeCompare(groupMonth(b))||a.title.localeCompare(b.title,'he'));
 let previous='';
 app.querySelector('#song-list').innerHTML=songs.map(s=>{const heading=previous===groupMonth(s)?'':`<h2 class="month">${monthName(groupMonth(s))}</h2>`;previous=groupMonth(s);const own=s.shares.some(x=>x.person===state.person);return `${heading}<article class="song" data-song="${escape(s.id)}"><a class="song-link" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="האזנה ל${escape(s.title)}">${image(s)}<div class="text"><div class="title" dir="auto">${escape(s.title)}</div><div class="artist" dir="auto">${escape(s.artist)}</div><div class="sender">${escape(names(s))}</div></div></a>${own?'<div class="own">שיר ששיתפת</div>':`<div class="actions"><button class="choice like"  data-value="1" aria-pressed="${state.votes[s.id]===1}">♡ אהבתי</button><button class="choice love"  data-value="3" aria-pressed="${state.votes[s.id]===3}">★ ממש אהבתי</button></div>`}</article>`;}).join('')||'<div class="empty">לא נמצאו שירים</div>';
 app.querySelectorAll('.choice').forEach(button=>button.onclick=()=>vote(button.closest('[data-song]').dataset.song,Number(button.dataset.value)));
 observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=entry.target.dataset.song;if(entry.isIntersecting&&!viewed.has(id)){viewed.add(id);queuedSeen.add(id);clearTimeout(seenTimer);seenTimer=setTimeout(flushSeen,15000);}}},{threshold:.6});
 app.querySelectorAll('[data-song]').forEach(n=>observer.observe(n));
 app.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.style.visibility='hidden';});
}
let flushing=false;
async function flushSeen(){
 if(flushing||!queuedSeen.size)return;flushing=true;const batch=[...queuedSeen].slice(0,100);batch.forEach(id=>queuedSeen.delete(id));
 try{const next=await api('seen',{songs:batch});setState(next);const n=document.querySelector('#save-status');if(n)n.textContent='';}
 catch(e){batch.forEach(id=>queuedSeen.add(id));const n=document.querySelector('#save-status');if(n)n.textContent='ההתקדמות תישמר כשהחיבור יחזור';}
 finally{flushing=false;if(queuedSeen.size)seenTimer=setTimeout(flushSeen,1500);}
}
function vote(id,value){
 if(savingBallot)return;
 if(catalog.songs.find(s=>s.id===id)?.shares.some(s=>s.person===state.person)){notice('אי אפשר להצביע לשיר שלך');return;}
 try{draft.choose(id,value);state.votes=draft.votes;savedMessage='';updateProgress();
 const card=app.querySelector(`[data-song="${CSS.escape(id)}"]`);card?.querySelectorAll('.choice').forEach(b=>b.setAttribute('aria-pressed',String(state.votes[id]===Number(b.dataset.value))));}
 catch(e){notice(e.message);}
}

function renderStats(){
 const content=app.querySelector('#content');
 content.innerHTML=`<div class="metrics"><div class="metric"><strong>${number(stats.votes)}</strong><span>בחירות</span></div><div class="metric"><strong>${number(stats.songs.filter(s=>s.score>0).length)}</strong><span>שירים אהובים</span></div></div><div class="stat-switch"><button data-view="songs" class="${statsView==='songs'?'active':''}">השירים</button><button data-view="people" class="${statsView==='people'?'active':''}">מי ששלחו</button></div><div id="ranking"></div>`;
 content.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{statsView=b.dataset.view;statsLimit=50;renderStats();});
 const ranked=statsView==='songs'?stats.songs.filter(s=>s.score>0):stats.contributors.filter(p=>p.score>0);
 content.querySelector('#ranking').innerHTML=ranked.slice(0,statsLimit).map((r,i)=>{const song=statsView==='songs'?catalog.songs.find(s=>s.id===r.id):null;return `<article class="statrow"><span class="rank">${i+1}</span>${song?`<a href="${escape(song.url)}" target="_blank" rel="noopener noreferrer">${image(song)}</a>`:''}<div class="text"><div class="title" dir="auto">${escape(song?song.title:personName(r.person))}</div>${song?`<div class="artist" dir="auto">${escape(song.artist)}</div><div class="sender">${escape(names(song))}</div><button class="voters" data-voters="${escape(song.id)}">${r.likes} אהבתי · ${r.loves} ממש אהבתי</button>`:''}</div><div class="score">${number(r.score)}<small>נקודות</small></div></article>`;}).join('')||'<p class="empty">הבחירות הראשונות בדרך</p>';
 if(ranked.length>statsLimit){const more=document.createElement('button');more.className='more';more.textContent='עוד';more.onclick=()=>{statsLimit+=50;renderStats();};content.append(more);}
 content.querySelectorAll('[data-voters]').forEach(b=>b.onclick=()=>{const r=stats.songs.find(s=>s.id===b.dataset.voters);modal('מי אהבו?',r.voters.map(v=>`<div class="modal-row"><span>${escape(personName(v.person))}</span><span>${v.value===3?'ממש אהבתי':'אהבתי'}</span></div>`).join(''));});
}
async function start(){app.innerHTML='<div class="loading">טוענים את השירים…</div>';try{catalog=await api('catalog');try{const restored=await api('state');if(!selectablePeople().some(p=>p.id===restored.person))throw Object.assign(new Error('יש לבחור שם'),{status:401});setState(restored);render();}catch(e){if(e.status===401)renderLogin();else throw e;}}catch(e){app.innerHTML='<div class="loading">לא הצלחנו לטעון את השירים<br><button class="retry">ננסה שוב</button></div>';app.querySelector('button').onclick=start;}}
setInterval(async()=>{if(!state||busy||savingBallot||document.hidden||document.querySelector('.login'))return;try{setState(await api('state'));if(tab==='stats'){stats=await api('stats');renderStats();}}catch{}},30000);
window.addEventListener('online',flushSeen);
window.addEventListener('beforeunload',e=>{if(draft?.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',async()=>{if(!state||!previewMode||googleRequest)return;setState(await api('state'));if(tab==='stats'){stats=await api('stats');renderStats();}else listSongs();});
start();

function renderNameReview(){
 const reviews=localStore.reviews();
 modal('שמות לבדיקה',`<p class="note">נשמר במכשיר הזה. בסיום אפשר לייצא ולשלוח לי.</p><input id="review-search" placeholder="חיפוש שם" aria-label="חיפוש שם לעריכה"><div id="review-people"></div><button id="export-reviews" class="person">ייצוא הערות</button>`);
 function list(q=''){dialog.querySelector('#review-people').innerHTML=selectablePeople().filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).map(p=>`<button class="review-person" data-review="${escape(p.id)}">${escape(p.name)}${reviews[p.id]?' · '+(reviews[p.id].action==='remove'?'להסרה':'לשינוי'):''}</button>`).join('');dialog.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>editName(b.dataset.review));}
 dialog.querySelector('#review-search').oninput=e=>list(e.target.value);list();
 dialog.querySelector('#export-reviews').onclick=()=>{const rows=Object.entries(localStore.reviews()).map(([id,r])=>({id,name:personName(id),...r}));const blob=new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='five-stars-name-reviews.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
function editName(id){
 const current=localStore.reviews()[id]||{};dialog.close();
 modal(personName(id),`<form id="name-review-form"><label>פעולה<select id="review-action"><option value="keep">להשאיר</option><option value="remove">להסיר</option><option value="rename">לשנות שם</option></select></label><label>השם החדש<input id="review-new-name" value="${escape(current.name||'')}"></label><label>למה?<textarea id="review-reason">${escape(current.reason||'')}</textarea></label><button class="person" type="submit">שמירת הערה</button></form>`);
 dialog.querySelector('#review-action').value=current.action||'keep';
 dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const action=dialog.querySelector('#review-action').value;const name=dialog.querySelector('#review-new-name').value.trim();if(action==='rename'&&!name){notice('מה השם החדש?');return;}localStore.review(id,{action,name,reason:dialog.querySelector('#review-reason').value.trim()});dialog.close();renderNameReview();};
}
