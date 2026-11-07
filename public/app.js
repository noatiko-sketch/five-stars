const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let catalog, state, tab = 'songs', stats, statsView = 'songs', statsLimit = 50, busy = false;
let query = '', sender = '', month = '', observer, noticeTimer, seenTimer;
const queuedSeen = new Set();
const viewed = new Set();
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString('he-IL');
const personName = id => catalog.people.find(p => p.id === id)?.name || '';
async function api(path, body) {
  const response = await fetch(`/api/${path}`, { method:body ? 'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), {status:response.status});
  return result;
}
function notice(text) { const node=document.querySelector('#notice');node.textContent=text;node.classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.classList.remove('visible'),4000); }
function modal(title, content) { dialog.innerHTML=`<h2>${escape(title)}</h2><div class="modal-list">${content}</div><button class="close">סגירה</button>`;dialog.querySelector('.close').onclick=()=>dialog.close();dialog.showModal(); }
function setState(next) { if(state?.person===next.person && next.revision < state.revision)return; state=next; next.seen.forEach(id=>viewed.add(id)); updateProgress(); }
function updateProgress() {
  const label=document.querySelector('#progress-label');
  if(label) label.textContent=`${number(state.seen.length)} / ${number(state.total)}`;
  const fill=document.querySelector('.track i'); if(fill)fill.style.width=`${state.seen.length/state.total*100}%`;
  const results=document.querySelector('#stats-tab');if(results){results.classList.toggle('locked',!state.unlocked);results.setAttribute('aria-disabled',String(!state.unlocked));}
  const loves=document.querySelector('#love-count');if(loves)loves.textContent=`${Object.values(state.votes).filter(v=>v===3).length} / 3 ממש אהבתי`;
}
function image(song) { return song.image ? `<img class="art" src="${escape(song.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''; }
function names(song){return [...new Set(song.shares.map(s=>personName(s.person)))].join(' · ');}
function monthName(key){return new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric'}).format(new Date(key+'-02T12:00:00'));}
function renderLogin(){
  observer?.disconnect();
  app.innerHTML=`<section class="login"><div class="kicker">שירי מוצ״ש · חוגגים 2,000</div><h1>חמישה<br><span>כוכבים.</span></h1><h2>מי כאן?</h2><input id="name-search" aria-label="חיפוש השם שלי" placeholder="השם שלי"><div class="names"></div><p class="note">השם שבחרת יופיע לצד הבחירות שלך בסטטיסטיקות.</p></section>`;
  const namesNode=app.querySelector('.names');
  function list(q=''){namesNode.innerHTML=catalog.people.filter(p=>p.name.includes(q)).map(p=>`<button class="person" data-person="${p.id}">${escape(p.name)}</button>`).join('') || '<p>לא נמצא שם</p>';namesNode.querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{setState(await api('session',{person:b.dataset.person}));viewed.clear();state.seen.forEach(id=>viewed.add(id));query='';sender='';month='';tab='songs';render();}catch(e){notice(e.message);b.disabled=false;}finally{busy=false;}});}
  app.querySelector('input').oninput=e=>list(e.target.value.trim());list();
}
function render(){
 observer?.disconnect();
 app.innerHTML=`<header><a class="brand" href="/">חמישה כוכבים.</a><button class="identity">${escape(personName(state.person))}</button></header><main class="wrap"><section class="hero"><h1>${tab==='songs'?'תגיד מה<span>אהבת.</span>':'הכי הרבה<span>אהבה.</span>'}</h1><div class="count"><strong>${number(tab==='songs'?catalog.songs.length:stats?.participants||0)}</strong><small>${tab==='songs'?'שירים מהקבוצה':'משתתפים הצביעו'}</small></div></section><div id="content"></div></main><nav class="bottom" aria-label="ניווט ראשי"><button id="songs-tab" class="${tab==='songs'?'active':''}" aria-current="${tab==='songs'?'page':'false'}">תגיד מה אהבת</button><button id="stats-tab" class="${tab==='stats'?'active':''}">השירים האהובים ביותר</button></nav>`;
 app.querySelector('.identity').onclick=()=>{if(busy||flushing){notice('רגע, שומרים את הבחירה');return;}queuedSeen.clear();viewed.clear();state=null;renderLogin();};
 app.querySelector('#songs-tab').onclick=()=>{tab='songs';render();window.scrollTo(0,0);};
 app.querySelector('#stats-tab').onclick=async()=>{if(!state.unlocked){notice('התוצאות ייפתחו אחרי מעבר על כל השירים');return;}try{stats=await api('stats');tab='stats';render();window.scrollTo(0,0);}catch(e){notice(e.message);}};
 if(tab==='songs')renderSongs();else renderStats();updateProgress();
}
function renderSongs(){
 const months=[...new Set(catalog.songs.flatMap(s=>s.shares.map(x=>x.date.slice(0,7))))].sort();
 app.querySelector('#content').innerHTML=`<div class="toolbar"><input id="search" type="search" placeholder="איזה שיר?" aria-label="חיפוש שיר או אמן" value="${escape(query)}"><select id="sender" aria-label="סינון לפי משתף"><option value="">כולם</option>${catalog.people.map(p=>`<option value="${p.id}" ${sender===p.id?'selected':''}>${escape(p.name)}</option>`).join('')}</select><select id="month" aria-label="סינון לפי חודש"><option value="">כל החודשים</option>${months.map(m=>`<option value="${m}" ${month===m?'selected':''}>${monthName(m)}</option>`).join('')}</select></div><div class="progress"><span id="progress-label"></span><div class="track"><i></i></div><span id="love-count"></span></div><div class="save-status" id="save-status"></div><div id="song-list"></div>`;
 app.querySelector('#search').oninput=e=>{query=e.target.value;listSongs();};app.querySelector('#sender').onchange=e=>{sender=e.target.value;listSongs();};app.querySelector('#month').onchange=e=>{month=e.target.value;listSongs();};listSongs();
}
function listSongs(){
 observer?.disconnect();
 const q=query.trim().toLocaleLowerCase();
 const groupMonth=s=>month||s.shares.filter(x=>!sender||x.person===sender).map(x=>x.date.slice(0,7)).sort()[0];
 const songs=catalog.songs.filter(s=>(!q||`${s.title} ${s.artist}`.toLocaleLowerCase().includes(q))&&s.shares.some(x=>(!sender||x.person===sender)&&(!month||x.date.startsWith(month)))).sort((a,b)=>groupMonth(a).localeCompare(groupMonth(b))||a.title.localeCompare(b.title,'he'));
 let previous='';
 app.querySelector('#song-list').innerHTML=songs.map(s=>{const heading=previous===groupMonth(s)?'':`<h2 class="month">${monthName(groupMonth(s))}</h2>`;previous=groupMonth(s);const own=s.shares.some(x=>x.person===state.person);return `${heading}<article class="song" data-song="${escape(s.id)}"><a class="song-link" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="האזנה ל${escape(s.title)}">${image(s)}<div class="text"><div class="title" dir="auto">${escape(s.title)}</div><div class="artist" dir="auto">${escape(s.artist)}</div><div class="sender">${escape(names(s))}</div></div></a>${own?'<div class="own">שיר ששיתפת</div>':`<div class="actions"><button class="choice like" data-value="1" aria-pressed="${state.votes[s.id]===1}">אהבתי</button><button class="choice love" data-value="3" aria-pressed="${state.votes[s.id]===3}">ממש אהבתי</button></div>`}</article>`;}).join('')||'<div class="empty">לא נמצאו שירים</div>';
 app.querySelectorAll('.choice').forEach(button=>button.onclick=()=>vote(button.closest('[data-song]').dataset.song,Number(button.dataset.value)));
 observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=entry.target.dataset.song;if(entry.isIntersecting&&!viewed.has(id)){viewed.add(id);queuedSeen.add(id);clearTimeout(seenTimer);seenTimer=setTimeout(flushSeen,650);}}},{threshold:.6});
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
async function vote(id,value){
 if(busy)return;
 const next=state.votes[id]===value?0:value;
 if(next===3&&Object.values(state.votes).filter(v=>v===3).length>=3){const chosen=catalog.songs.filter(s=>state.votes[s.id]===3);modal('שלושת הכוכבים שלך',chosen.map(s=>`<div class="modal-row"><span>${escape(s.title)}</span><button class="choice" data-remove="${escape(s.id)}">הסרה</button></div>`).join(''));dialog.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{dialog.close();await vote(b.dataset.remove,3);});return;}
 busy=true;app.querySelectorAll('.choice').forEach(b=>b.disabled=true);
 try{setState(await api('vote',{song:id,value:next}));listSongs();}
 catch(e){notice(e.message);app.querySelectorAll('.choice').forEach(b=>b.disabled=false);}
 finally{busy=false;}
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
async function start(){app.innerHTML='<div class="loading">טוענים את השירים…</div>';try{catalog=await api('catalog');try{setState(await api('state'));render();}catch(e){if(e.status===401)renderLogin();else throw e;}}catch(e){app.innerHTML='<div class="loading">לא הצלחנו לטעון את השירים<br><button class="retry">ננסה שוב</button></div>';app.querySelector('button').onclick=start;}}
setInterval(async()=>{if(!state||busy||document.hidden||document.querySelector('.login'))return;try{setState(await api('state'));if(tab==='stats'){stats=await api('stats');renderStats();}}catch{}},12000);
window.addEventListener('online',flushSeen);
start();
