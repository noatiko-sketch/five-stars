import {rankContributors} from './rankings.js';
import { connectGoogleStore } from './google-store.js';
import { createLocalStore } from './local-store.js';
import {createPeopleClient,activePeople,personName as displayName,songNames} from './people.js';
let peopleClient,selectionObserver;
import { createDraft, validateBallot, createAutoSave, receivedVotes } from './ballot.js';
import { createIdentity } from './identity.js';
const previewMode = globalThis.FIVE_STARS_PREVIEW === true;
const sandbox = globalThis.FIVE_STARS_SANDBOX === true;
let localStore;
const googleRequest = globalThis.FIVE_STARS_STORAGE_URL ? connectGoogleStore(globalThis.FIVE_STARS_STORAGE_URL) : null;
const identity=createIdentity(localStorage,document,sandbox);
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let catalog, state, tab = 'songs', stats, statsView = 'songs', statsMetric = 'score', statsLimit = 50, busy = false;
let query = '', sender = '', month = '', observer, noticeTimer, seenTimer;
const queuedSeen = new Set();
const viewed = new Set();
let draft, savingBallot=false, savedMessage='';
let autoSave,autoSaveError=false,receivedCount=null,receivedAt=0,refreshingReceived=false;
let listObserver, listLayoutFrame=0, viewMargins='', songPositions=[], monthPositions=[];
const draftKey=person=>`five-stars:draft:${sandbox?'test':'live'}:${person}`;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString('he-IL');
const selectablePeople = () => activePeople(catalog);
const personName = id => displayName(catalog,id);
async function api(path, body) {
  if (previewMode) {
    if (path === 'catalog') {
      const response = await fetch('./catalog.json');
      if (!response.ok) throw new Error('לא הצלחנו לטעון את השירים');
      return response.json();
    }
    if(googleRequest){
      const person=body?.person||state?.person||identity.get();
      if(!person||!catalog.people.some(p=>p.id===person&&p.active!==false))throw Object.assign(new Error('יש לבחור שם'),{status:401});
      let result=await googleRequest(path,{...body,person});
      if(!sandbox&&path==='session'&&Object.keys(result.votes).length===0){
       try{const prior=JSON.parse(localStorage.getItem('five-stars:live-local:v1')||'{}').people?.[person]?.votes;if(prior&&Object.keys(prior).length)result=await googleRequest('import',{person,votes:prior});}catch{notice('הבחירות המקומיות נשארו במכשיר; אפשר לבדוק אותן בהמשך');}
      }
      if(path==='session')identity.set(person);
      return result;
    }
    localStore ||= createLocalStore(catalog, localStorage, sandbox?'sandbox':'live-local');
    if (path === 'session') {identity.set(body.person);return localStore.state(body.person);}
    if (!state) {const person=identity.get();if(path==='state'&&selectablePeople().some(p=>p.id===person))return localStore.state(person);throw Object.assign(new Error('יש לבחור שם'), {status:401});}
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
function modal(title, content) { selectionObserver?.disconnect();dialog.classList.remove('selections-dialog','love-selections');dialog.innerHTML=`<h2>${escape(title)}</h2><div class="modal-list">${content}</div><button class="close">סגירה</button>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.showModal(); }
function setState(next) {
 if(state?.person===next.person && next.revision < state.revision)return;
 if(!draft||state?.person!==next.person){
  autoSave?.stop();draft=createDraft(localStorage,draftKey(next.person),next.person,next.votes);
  receivedCount=null;receivedAt=0;autoSaveError=false;
  const person=next.person,ballot=draft;
  autoSave=createAutoSave(ballot,async body=>{const next=await api('vote',{...body,person});if(state?.person===person)state.revision=Math.max(state.revision||0,next.revision||0);return next;},{changed:status=>{if(draft!==ballot)return;autoSaveError=status.error?.message||'';if(state?.person===person){state.votes=ballot.votes;updateProgress();}else updateSave();}});
  if(draft.dirty)autoSave.queue();
 }
 else draft.receive(next.votes);
 identity.set(next.person);
 state={...next,votes:draft.votes};document.querySelectorAll('.song .choice').forEach(b=>b.setAttribute('aria-pressed',String(state.votes[b.closest('[data-song]').dataset.song]===Number(b.dataset.value))));next.seen.forEach(id=>viewed.add(id));updateSeenIndicators();updateProgress();
}
function updateSave(){const hasVotes=Object.keys(draft?.votes||{}).length;const button=document.querySelector('#save-ballot');if(button){button.disabled=savingBallot||!hasVotes;button.textContent=savingBallot?'שומרים…':'שמירת הבחירות';}const status=document.querySelector('#ballot-status');if(status)status.textContent=autoSaveError?(/5|שלך|תקינה/.test(autoSaveError)?autoSaveError:'הבחירות במכשיר; ננסה לשמור שוב כשהחיבור יחזור'):draft?.dirty?'':savedMessage||(hasVotes?'נשמר אוטומטית':'');}
async function saveBallot(){
 if(savingBallot||!draft)return;
 try{validateBallot(catalog,state.person,draft.votes);}catch(e){notice(e.message);return;}
 savingBallot=true;updateSave();
 try{await autoSave.flush();const next=await api('save',{votes:draft.votes,baseVotes:draft.baseVotes});draft.saved(next.votes);setState(next);savedMessage='נשמר';}
 catch(e){notice(e.message);savedMessage='';if(e.message.includes('מכשיר אחר')){modal('הבחירות השתנו במכשיר אחר','<button id="reload-ballot" class="person">טעינת הבחירות השמורות במקום הטיוטה</button>');dialog.querySelector('#reload-ballot').onclick=async()=>{try{const next=await api('state');draft.clear();draft=null;state=null;setState(next);dialog.close();render();}catch(error){notice(error.message);}};}}
 finally{savingBallot=false;updateSave();}
}
function updateReceived(){
 const button=app.querySelector('#received-votes');
 if(!button)return;
 button.hidden=receivedCount===null;
 if(receivedCount!==null)button.textContent=`${number(receivedCount)} הצבעות לשירים שלך`;
}
async function refreshReceived(){
 if(!state||document.hidden||refreshingReceived||Date.now()-receivedAt<120000)return;
 const person=state.person;refreshingReceived=true;
 try{let count;if(googleRequest)count=receivedVotes(catalog,person,await googleRequest('stats',{person}));else if(previewMode)count=receivedVotes(catalog,person,localStore.stats(person,true));else count=(await api('received')).count;if(state?.person!==person)return;receivedCount=count;receivedAt=Date.now();updateReceived();}catch{}finally{refreshingReceived=false;}
}
function updateViewedProgress(){
 const label=app.querySelector('#progress-label');
 if(label)label.textContent=`(עברת על ${number(viewed.size)} שירים מתוך ${number(state.total)})`;
 const canvas=app.querySelector('#seen-map');
 if(!canvas||!songPositions.length||!canvas.clientHeight)return;
 const scale=window.devicePixelRatio||1;
 const width=Math.round(canvas.clientWidth*scale),height=Math.round(canvas.clientHeight*scale);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 const context=canvas.getContext('2d');
 context.clearRect(0,0,width,height);
 context.fillStyle=getComputedStyle(canvas).color;
 for(const {id,start,end} of songPositions){
  if(viewed.has(id))context.fillRect(0,start*height,width,Math.max(scale,(end-start)*height));
 }
}
function updateProgress() {
  updateViewedProgress();
  const results=document.querySelector('#stats-tab');if(results){results.classList.toggle('locked',!state.unlocked&&!sandbox);results.setAttribute('aria-disabled',String(!state.unlocked&&!sandbox));}
  const likes=document.querySelector('#like-count bdi');if(likes)likes.textContent=`${Object.values(state.votes).filter(v=>v===1).length}/10+`;
  updateSave();
  const loves=document.querySelector('#love-count bdi');if(loves)loves.textContent=`${Object.values(state.votes).filter(v=>v===3).length}/5`;
}
function image(song) { return song.image ? `<img class="art" src="${escape(song.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''; }
function names(song){return songNames(catalog,song);}
function eyeIcon(unseen=false){return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${unseen?'<path class="eye-unseen" d="M3 3l18 18"/>':''}</svg>`;}
function eyeMarkup(id){const seen=viewed.has(id);return `<span class="seen-indicator ${seen?'is-seen':''}" role="img" aria-label="${seen?'נצפה':'טרם נצפה'}" title="${seen?'נצפה':'טרם נצפה'}">${eyeIcon(true)}</span>`;}
function songMarkup(s){const own=s.shares.some(x=>x.person===state.person);return `<article class="song" data-song="${escape(s.id)}"><a class="song-link" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="האזנה ל${escape(s.title)}">${image(s)}<div class="text"><div class="title" dir="auto">${escape(s.title)} <span class="title-eye">${eyeMarkup(s.id)}</span></div><div class="artist" dir="auto">${escape(s.artist)}</div><div class="song-meta"><div class="sender">${escape(names(s))}</div></div></div></a>${own?'<div class="own">שיר ששיתפת</div>':`<div class="actions"><button class="choice like" data-value="1" aria-pressed="${state.votes[s.id]===1}"><span>אהבתי</span><small>והכרתי בזכותך</small></button><button class="choice love" data-value="3" aria-pressed="${state.votes[s.id]===3}"><span>ממש אהבתי</span><small>והכרתי בזכותך</small></button></div>`}</article>`;}
function updateSeenIndicators(id){
 const cards=id?document.querySelectorAll(`[data-song="${CSS.escape(id)}"]`):document.querySelectorAll('.song[data-song]');
 for(const card of cards){const seen=viewed.has(card.dataset.song),icon=card.querySelector('.seen-indicator');if(!icon)continue;icon.classList.toggle('is-seen',seen);icon.setAttribute('aria-label',seen?'נצפה':'טרם נצפה');icon.title=seen?'נצפה':'טרם נצפה';}
}
function markViewed(id){if(viewed.has(id))return false;viewed.add(id);queuedSeen.add(id);updateSeenIndicators(id);clearTimeout(seenTimer);seenTimer=setTimeout(flushSeen,15000);return true;}
function observeViewed(entries){
 let changed=false;
 for(const entry of entries)if(entry.target.isConnected&&entry.intersectionRatio>=.6&&markViewed(entry.target.dataset.song))changed=true;
 if(changed)updateViewedProgress();
}
function monthName(key){return new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric'}).format(new Date(key+'-02T12:00:00'));}
function renderLogin(){
  observer?.disconnect();
  listObserver?.disconnect();
  app.innerHTML=`<section class="login"><div class="kicker">${sandbox?'סביבת ניסוי':'שירי מוצ״ש · חוגגים 2,000'}</div><h1>חמישה<br><span>כוכבים.</span></h1><h2>מי כאן?</h2><input id="name-search" aria-label="חיפוש השם שלי" placeholder="השם שלי"><div class="names"></div>${peopleClient?.supported?'<button class="identity" id="add-person">הוספת שם</button>':''}<p class="note">השם שבחרת יופיע לצד הבחירות שלך בסטטיסטיקות.</p></section>`;
  const namesNode=app.querySelector('.names');
  function list(q=''){namesNode.innerHTML=selectablePeople().filter(p=>p.name.includes(q)).map(p=>`<button class="person" data-person="${p.id}">${escape(p.name)}</button>`).join('') || '<p>לא נמצא שם</p>';namesNode.querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{setState(await api('session',{person:b.dataset.person}));viewed.clear();state.seen.forEach(id=>viewed.add(id));query='';sender='';month='';tab='songs';render();}catch(e){notice(e.message);b.disabled=false;}finally{busy=false;}});}
  app.querySelector('#add-person')?.addEventListener('click',()=>{modal('הוספת שם','<form id="add-person-form"><input id="new-person-name" aria-label="שם מלא" placeholder="שם מלא" maxlength="80" required><button class="person" type="submit">הוספה</button></form>');dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const result=await peopleClient.add(dialog.querySelector('input').value);catalog.people=result.people;dialog.close();renderLogin();}catch(error){notice(error.message);button.disabled=false;}};});
  app.querySelector('input').oninput=e=>list(e.target.value.trim());list();
}
function render(){
 observer?.disconnect();
 listObserver?.disconnect();
 songPositions=[];monthPositions=[];
 app.innerHTML=`
  <div class="sticky-status">
   <div class="voting-top">
    <div class="vote-counters">
     <button id="like-count" type="button">★ אהבתי <bdi dir="ltr"></bdi></button>
     <button id="love-count" type="button">★★ ממש אהבתי <bdi dir="ltr"></bdi></button>
    </div>
    <div class="identity-summary">
     <button class="identity" type="button">${escape(personName(state.person))}</button>
     <button id="received-votes" type="button" hidden></button>
    </div>
   </div>
   ${tab==='songs'?'<div class="voting-intro"><h1>סמן שירים שהכרת בזכות הקבוצה</h1><span id="progress-label"></span></div>':''}
   <div id="sticky-search"></div>
   ${previewMode&&!googleRequest&&!sandbox?'<small>נשמר במכשיר הזה בלבד · ללא סנכרון</small>':''}
   ${sandbox?'<small>סביבת ניסוי</small> <button id="review-names">עריכת שמות</button><button id="test-reset">איפוס ניסוי</button>':''}
  </div>
  <main class="wrap voting-wrap"><div id="content"></div></main>`;
 app.querySelector('#received-votes').onclick=()=>notice('תוכל לראות מי מה ולמה רק אחרי שתסיים להצביע:)');
 app.querySelector('.identity').onclick=async()=>{if(savingBallot||busy||flushing)return;busy=true;try{await autoSave?.flush();autoSave?.stop();queuedSeen.clear();viewed.clear();draft=null;clearTimeout(seenTimer);state=null;identity.clear();renderLogin();}catch(e){notice('ההחלפה תתאפשר כשהבחירות יישמרו');}finally{busy=false;}};

 if(sandbox){app.querySelector('#review-names').onclick=()=>{localStore ||= createLocalStore(catalog,localStorage,'sandbox');renderNameReview();};app.querySelector('#test-reset').onclick=()=>{modal('לאפס את נתוני הניסוי?', '<p>הצבעות הניסוי וההתקדמות של כל המשתתפים בטסט יימחקו.</p><button id="confirm-reset" class="person">איפוס</button>');dialog.querySelector('#confirm-reset').onclick=async()=>{if(savingBallot||busy||flushing||autoSave?.running||autoSave?.pending){notice('רגע, שומרים');return;}busy=true;try{autoSave?.stop();const person=state.person;queuedSeen.clear();viewed.clear();clearTimeout(seenTimer);if(googleRequest){const next=await api('reset',{});draft?.clear();draft=null;dialog.close();state=null;setState(next);}else{localStore.reset();draft?.clear();draft=null;dialog.close();state=null;setState(localStore.state(person));}render();notice('נתוני הניסוי אופסו');}catch(e){notice(e.message);}finally{busy=false;}};};}
 app.querySelector('#like-count').onclick=()=>editSelections(1);app.querySelector('#love-count').onclick=()=>editSelections(3);if(tab==='songs')renderSongs();else renderStats();updateProgress();updateReceived();refreshReceived();
}
function renderSongs(){
 const months=[...new Set(catalog.songs.flatMap(s=>s.shares.map(x=>x.date.slice(0,7))))].sort();
 app.querySelector('#content').innerHTML=`<div class="toolbar"><input id="search" type="search" placeholder="איזה שיר?" aria-label="חיפוש שיר או אמן" value="${escape(query)}"><button type="button" id="filter-toggle" aria-label="סינון שירים" aria-expanded="false" aria-controls="song-filters"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button><div id="song-filters" hidden><select id="sender" aria-label="סינון לפי משתף"><option value="">כולם</option>${selectablePeople().map(p=>`<option value="${p.id}" ${sender===p.id?'selected':''}>${escape(p.name)}</option>`).join('')}</select><select id="month" aria-label="סינון לפי חודש"><option value="">כל החודשים</option>${months.map(m=>`<option value="${m}" ${month===m?'selected':''}>${monthName(m)}</option>`).join('')}</select></div></div><div class="save-status" id="save-status"></div><div id="song-list"></div><aside class="month-scroll" aria-label="ניווט וצפייה ברשימת השירים" hidden>
  <div class="month-jumps" aria-label="קפיצה לתאריך"></div>
  <input id="month-scroll" type="range" min="0" max="1000" value="0" aria-label="גלילה לפי חודש ושנה" orient="vertical">
  <div class="seen-rail" role="img" aria-label="מיקומי השירים שנצפו">
   ${eyeIcon()}
   <canvas id="seen-map" aria-hidden="true"></canvas>
  </div>
  <span id="scroll-month" aria-hidden="true"></span>
 </aside><div class="ballot-save"><span id="ballot-status" role="status"></span><button id="save-ballot" type="button">שמירת הבחירות</button></div>`;
 const header=app.querySelector('.sticky-status');
 const filterButton=app.querySelector('#filter-toggle');
 const panel=app.querySelector('#song-filters');
 app.querySelector('#sticky-search').append(app.querySelector('.toolbar'));
 filterButton.onclick=()=>{
  panel.hidden=!panel.hidden;
  filterButton.setAttribute('aria-expanded',String(!panel.hidden));
 };
 app.querySelector('#month-scroll').oninput=e=>window.scrollTo(0,Number(e.target.value)/1000*maxScroll());
 app.querySelector('#save-ballot').onclick=saveBallot;
 updateSave();
 function refreshList(){window.scrollTo(0,0);listSongs();}
 app.querySelector('#search').oninput=e=>{query=e.target.value;refreshList();};
 app.querySelector('#sender').onchange=e=>{sender=e.target.value;refreshList();};
 app.querySelector('#month').onchange=e=>{month=e.target.value;refreshList();};
 listObserver=new ResizeObserver(scheduleListLayout);
 for(const element of [header,app.querySelector('#song-list'),app.querySelector('.ballot-save')])listObserver.observe(element);
 listSongs();
}
function listSongs(){
 observer?.disconnect();
 const q=query.trim().toLocaleLowerCase();
 const groupMonth=s=>month||s.shares.filter(x=>!sender||x.person===sender).map(x=>x.date.slice(0,7)).sort()[0];
 const songs=catalog.songs.filter(s=>(!q||`${s.title} ${s.artist}`.toLocaleLowerCase().includes(q))&&s.shares.some(x=>(!sender||x.person===sender)&&(!month||x.date.startsWith(month)))).sort((a,b)=>groupMonth(a).localeCompare(groupMonth(b))||a.title.localeCompare(b.title,'he'));
 let previous='';
 app.querySelector('#song-list').innerHTML=songs.map(s=>{const heading=previous===groupMonth(s)?'':`<h2 class="month" data-month="${escape(groupMonth(s))}">${monthName(groupMonth(s))}</h2>`;previous=groupMonth(s);return `${heading}${songMarkup(s)}`;}).join('')||'<div class="empty">לא נמצאו שירים</div>';
 app.querySelectorAll('.choice').forEach(button=>button.onclick=()=>vote(button.closest('[data-song]').dataset.song,Number(button.dataset.value)));
 viewMargins='';
 for(const img of app.querySelectorAll('#song-list img'))img.onerror=()=>{img.style.visibility='hidden';};
 scheduleListLayout();
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
 try{const previous=draft.votes[id];draft.choose(id,value);state.votes=draft.votes;savedMessage='';autoSaveError=false;autoSave.queue();updateProgress();
 const loveCount=Object.values(state.votes).filter(v=>v===3).length;if(value===3&&previous!==3&&(loveCount===4||loveCount===5))notice('רק המעזים ואלה שלא מקשיבים לחוקים יוכלו לבחור עוד שניים שהם ממש אהבו');
 const cards=document.querySelectorAll(`[data-song="${CSS.escape(id)}"] .choice`);cards.forEach(b=>b.setAttribute('aria-pressed',String(state.votes[id]===Number(b.dataset.value))));}
 catch(e){notice(e.message);}
}
function editSelections(value){
 const selected=catalog.songs.filter(s=>draft.votes[s.id]===value);
 modal(value===3?'ממש אהבתי':'אהבתי',selected.map(songMarkup).join('')||'<p>עדיין אין בחירות</p>');
 dialog.classList.add('selections-dialog');
 dialog.classList.toggle('love-selections',value===3);
 dialog.querySelectorAll('.choice').forEach(button=>button.onclick=()=>vote(button.closest('[data-song]').dataset.song,Number(button.dataset.value)));
 selectionObserver=new IntersectionObserver(observeViewed,{root:dialog.querySelector('.modal-list'),threshold:.6});
 dialog.querySelectorAll('[data-song]').forEach(card=>selectionObserver.observe(card));
}
dialog.addEventListener('close',()=>selectionObserver?.disconnect());
let scrollFrame=0,scrollLabelTimer;
const maxScroll=()=>Math.max(0,document.documentElement.scrollHeight-document.documentElement.clientHeight);
function scheduleListLayout(){
 if(!listLayoutFrame)listLayoutFrame=requestAnimationFrame(layoutList);
}
function layoutList(){
 listLayoutFrame=0;
 const list=app.querySelector('#song-list');
 if(!list)return;
 const headerHeight=Math.ceil(app.querySelector('.sticky-status').getBoundingClientRect().height);
 const footerHeight=Math.ceil(app.querySelector('.ballot-save').getBoundingClientRect().height);
 app.style.setProperty('--voting-header-height',`${headerHeight}px`);
 app.style.setProperty('--voting-footer-height',`${footerHeight}px`);
 const cards=[...list.querySelectorAll('[data-song]')];
 const margins=`-${headerHeight}px 0px -${footerHeight}px 0px`;
 if(viewMargins!==margins){
  observer?.disconnect();
  observer=new IntersectionObserver(observeViewed,{threshold:.6,rootMargin:margins});
  for(const card of cards)observer.observe(card);
  viewMargins=margins;
 }
 const rail=app.querySelector('.month-scroll');
 const scrollMax=maxScroll();
 rail.hidden=!cards.length||!scrollMax;
 monthPositions=[];
 songPositions=[];
 if(rail.hidden)return;

 const top=list.getBoundingClientRect().top;
 const end=cards.at(-1).getBoundingClientRect().bottom;
 const listHeight=Math.max(1,end-top);
 songPositions=cards.map(card=>{
  const rect=card.getBoundingClientRect();
  return {id:card.dataset.song,start:(rect.top-top)/listHeight,end:(rect.bottom-top)/listHeight};
 });
 monthPositions=[...list.querySelectorAll('.month')].map(heading=>({
  top:heading.getBoundingClientRect().top+scrollY-headerHeight-8,
  label:heading.textContent
 }));
 const jumps=rail.querySelector('.month-jumps');
 jumps.replaceChildren();
 const count=Math.min(5,monthPositions.length);
 let last=-Infinity;
 for(let i=0;i<count;i++){
  const date=monthPositions[count===1?0:Math.round(i*(monthPositions.length-1)/(count-1))];
  const position=Math.min(1,Math.max(0,date.top/scrollMax));
  if(position-last<.08)continue;
  const button=document.createElement('button');
  button.type='button';
  button.className='month-jump';
  button.style.insetBlockStart=`${position*100}%`;
  button.dataset.label=date.label;
  button.setAttribute('aria-label',`קפיצה ל${date.label}`);
  button.onclick=()=>window.scrollTo(0,Math.min(maxScroll(),Math.max(0,date.top)));
  jumps.append(button);
  last=position;
 }
 updateViewedProgress();
 updateScrollMonth();
}
function updateScrollMonth(){
 const slider=app.querySelector('#month-scroll'),label=app.querySelector('#scroll-month');
 if(!slider||!monthPositions.length)return;
 const current=monthPositions.findLast(date=>date.top<=scrollY+16)||monthPositions[0];
 label.textContent=current.label;
 slider.setAttribute('aria-valuetext',current.label);
 slider.value=String(Math.round(scrollY/Math.max(1,maxScroll())*1000));
}
window.addEventListener('resize',scheduleListLayout);
window.addEventListener('scroll',()=>{
 if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateScrollMonth();});
 const rail=app.querySelector('.month-scroll');
 rail?.classList.add('scrolling');
 clearTimeout(scrollLabelTimer);
 scrollLabelTimer=setTimeout(()=>rail?.classList.remove('scrolling'),1400);
},{passive:true});
function renderStats(){
 const content=app.querySelector('#content');
 const label=statsMetric==='score'?'כוכבים':statsMetric==='votes'?'הצבעות':'ממש אהבתי';
 const metric=r=>statsMetric==='score'?r.score:statsMetric==='votes'?(r.votes??((r.likes||0)+(r.loves||0))):r.loves;
 content.innerHTML=`<div class="ranking-tabs embedded-metrics" role="group" aria-label="דירוג לפי"><button data-metric="score" aria-pressed="${statsMetric==='score'}">הכי הרבה כוכבים</button><button data-metric="votes" aria-pressed="${statsMetric==='votes'}">הכי הרבה הצבעות</button><button data-metric="loves" aria-pressed="${statsMetric==='loves'}">הכי הרבה ממש אהבתי</button></div><div class="stat-switch"><button data-view="songs" class="${statsView==='songs'?'active':''}" aria-pressed="${statsView==='songs'}">לפי שירים</button><button data-view="people" class="${statsView==='people'?'active':''}" aria-pressed="${statsView==='people'}">לפי אנשים</button></div><div id="ranking"></div>`;
 content.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{statsMetric=b.dataset.metric;statsLimit=50;renderStats();});
 content.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{statsView=b.dataset.view;statsLimit=50;renderStats();});
 const ranked=statsView==='songs'?stats.songs.filter(s=>s.score>0).slice().sort((a,b)=>metric(b)-metric(a)||b.score-a.score):rankContributors(catalog,stats.songs,statsMetric).filter(p=>p.score>0);
 content.querySelector('#ranking').innerHTML=ranked.slice(0,statsLimit).map((r,i)=>{const song=statsView==='songs'?catalog.songs.find(s=>s.id===r.id):null;return `<article class="statrow"><span class="rank">${i+1}</span>${song?`<a href="${escape(song.url)}" target="_blank" rel="noopener noreferrer">${image(song)}</a>`:''}<div class="text"><div class="title" dir="auto">${escape(song?song.title:personName(r.person))}</div>${song?`<div class="artist" dir="auto">${escape(song.artist)}</div><div class="sender">${escape(names(song))}</div><button class="voters" data-voters="${escape(song.id)}">${r.likes} אהבתי · ${r.loves} ממש אהבתי</button>`:''}</div><div class="score">${number(metric(r))}<small>${label}</small></div></article>`;}).join('')||'<p class="empty">הבחירות הראשונות בדרך</p>';
 if(ranked.length>statsLimit){const more=document.createElement('button');more.className='more';more.textContent='עוד';more.onclick=()=>{statsLimit+=50;renderStats();};content.append(more);}
 content.querySelectorAll('[data-voters]').forEach(b=>b.onclick=()=>{const r=stats.songs.find(s=>s.id===b.dataset.voters);modal('מי אהבו?',r.voters.map(v=>`<div class="modal-row"><span>${escape(personName(v.person))}</span><span>${v.value===3?'ממש אהבתי':'אהבתי'}</span></div>`).join(''));});
}
async function restoreSession(){try{return await api('state');}catch(error){if(error.status!==401)throw error;const person=identity.get();if(selectablePeople().some(p=>p.id===person))return api('session',{person});identity.clear();throw error;}}
async function start(){app.innerHTML='<div class="loading">טוענים את השירים…</div>';try{catalog=await api('catalog');peopleClient=createPeopleClient(googleRequest,catalog.people);catalog.people=await peopleClient.load();try{const restored=await restoreSession();if(!selectablePeople().some(p=>p.id===restored.person))throw Object.assign(new Error('יש לבחור שם'),{status:401});setState(restored);render();}catch(e){if(e.status===401){identity.clear();renderLogin();}else throw e;}}catch(e){app.innerHTML='<div class="loading">לא הצלחנו לטעון את השירים<br><button class="retry">ננסה שוב</button></div>';app.querySelector('button').onclick=start;}}
setInterval(async()=>{if(!state||busy||savingBallot||autoSave?.running||autoSave?.pending||document.hidden||document.querySelector('.login'))return;try{const person=state.person;const next=await api('state');if(state?.person!==person)return;setState(next);if(tab==='stats'){stats=await api('stats');renderStats();}}catch{}},30000);
setInterval(refreshReceived,120000+Math.random()*30000);
window.addEventListener('online',()=>{flushSeen();autoSave?.queue(0);refreshReceived();});
document.addEventListener('visibilitychange',()=>{if(state){autoSave?.flush().catch(()=>{});if(!document.hidden)refreshReceived();}});
window.addEventListener('pagehide',()=>autoSave?.flush().catch(()=>{}));
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
