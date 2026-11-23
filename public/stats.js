import { connectGoogleStore } from '../google-store.js';
import { createLocalStore } from '../local-store.js';
import { activePeople, createPeopleClient, personName, songNames } from '../people.js';
import { createIdentity } from '../identity.js';
import { mountLogin } from '../login.js';
import { rankContributors } from '../rankings.js';

const sandbox = globalThis.FIVE_STARS_SANDBOX === true;
const identity = createIdentity(localStorage, document, sandbox);
const shared = globalThis.FIVE_STARS_STORAGE_URL ? connectGoogleStore(globalThis.FIVE_STARS_STORAGE_URL) : null;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

const entry = document.querySelector('#stats-entry');
const content = document.querySelector('#stats-content');
const ranking = document.querySelector('#stats-ranking');
const summary = document.querySelector('#stats-summary');
const description = document.querySelector('.ranking-description');
const dialog = document.querySelector('#voter-dialog');
const filter = document.querySelector('#stats-sender');
const personalButton = document.querySelector('#stats-personal');
const identityButton = document.querySelector('#stats-identity');
const sortButtons = document.querySelectorAll('[data-sort]');

const labels = {
  score: {metric: 'כוכבים', description: 'כוכבים'},
  votes: {metric: 'הצבעות', description: 'הצבעות'},
  loves: {metric: 'ממש אהבתי', description: 'הצבעות ״ממש אהבתי״'},
};
let catalog, store, latestStats, refreshing = false;
let person = '', sort = 'score', personal = false, limit = 50;

function voteRow(vote) {
  const loved = vote.value === 3;
  const name = personName(catalog, vote.person) || 'משתתף שהוסר';
  return `<div class="modal-row"><span dir="auto">${escape(name)}</span><span class="vote-tag ${loved ? 'love' : 'like'}">${loved ? 'ממש אהבתי · 2 כוכבים' : 'אהבתי · כוכב אחד'}</span></div>`;
}

function songHeading(song) {
  const art = song.image ? `<img class="art" src="${escape(song.image)}" alt="" loading="lazy" decoding="async">` : '<span class="art"></span>';
  return `${art}<span class="text"><span class="title" dir="auto">${escape(song.title)}</span><span class="artist" dir="auto">${escape(song.artist)}</span><span class="sender">${escape(songNames(catalog, song))}</span></span>`;
}

function score(row) {
  return `<span class="score">${row[sort]}<small>${labels[sort].metric}</small></span>`;
}

function render() {
  if (!person) return;
  description.textContent = personal
    ? `השירים ששיתפת, לפי מספר ה${labels[sort].description}`
    : `דירוג השירים שקיבלו הכי הרבה ${labels[sort].description}`;
  summary.hidden = !personal || !latestStats;
  if (!latestStats) return;

  const sender = personal ? person : filter.value;
  const byId = new Map(latestStats.songs.map(result => [result.id, result]));
  const rows = catalog.songs
    .filter(song => !sender || song.shares.some(share => share.person === sender))
    .map(song => {
      const result = byId.get(song.id);
      const voters = result?.voters ?? [];
      return {song, voters, score: result?.score ?? 0, votes: voters.length, loves: result?.loves ?? 0};
    })
    .filter(row => sender || row.votes)
    .sort((a, b) => b[sort] - a[sort] || b.score - a.score || a.song.title.localeCompare(b.song.title, 'he'));

  if (personal) {
    const people = rankContributors(catalog, latestStats.songs, sort);
    const mine = people.find(row => row.person === person);
    const position = 1 + people.filter(row => row[sort] > mine[sort]).length;
    summary.innerHTML = `<strong>מקום ${position} מתוך ${people.length}</strong><span>בקבוצה לפי מספר ה${labels[sort].description} שקיבלו השירים ששיתפת</span>`;

    ranking.innerHTML = rows.slice(0, limit).map(row => `<article class="personal-song">
      <div class="ranking-card">${songHeading(row.song)}${score(row)}</div>
      ${row.votes ? row.voters.map(voteRow).join('') : '<p class="personal-no-votes">עדיין אין הצבעות לשיר הזה</p>'}
    </article>`).join('') || '<p class="empty">אין שירים ששיתפת ברשימה</p>';
  } else {
    ranking.innerHTML = rows.slice(0, limit).map((row, index) => `<button type="button" class="ranking-card" data-song="${escape(row.song.id)}" aria-label="${escape(row.song.title)} — פירוט הצבעות"><span class="rank">${index + 1}</span>${songHeading(row.song)}${score(row)}</button>`).join('')
      || '<p class="empty">אין שירים להצגה</p>';
    ranking.querySelectorAll('[data-song]').forEach(button => {
      button.onclick = () => openSong(rows.find(row => row.song.id === button.dataset.song));
    });
  }

  if (rows.length > limit) {
    const button = document.createElement('button');
    button.className = 'more';
    button.textContent = 'עוד שירים';
    button.onclick = () => { limit += 50; render(); };
    ranking.append(button);
  }
}

function openSong({song, score, voters}) {
  const votes = voters.map(voteRow).join('') || '<p class="note">עדיין אין הצבעות לשיר הזה</p>';
  dialog.innerHTML = `<h2 id="voter-dialog-title" dir="auto">${escape(song.title)}</h2>
    <p class="artist" dir="auto">${escape(song.artist)}</p><p>${score} כוכבים · ${voters.length} הצבעות</p>
    <div class="modal-list">${votes}</div>
    <div class="dialog-actions"><a class="identity" href="${escape(song.url)}" target="_blank" rel="noopener noreferrer">האזנה לשיר ↗</a><button class="close">סגירה</button></div>`;
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.showModal();
}

async function refresh() {
  if (!person || refreshing) return;
  if (!latestStats) ranking.innerHTML = '<p class="empty" role="status">טוענים את התוצאות…</p>';
  refreshing = true;
  try {
    latestStats = shared ? await shared('stats', {}) : store.stats(null, true);
    render();
  } catch {
    if (!latestStats) ranking.innerHTML = '<p class="empty" role="status">לא הצלחנו לטעון את התוצאות. נסו לרענן.</p>';
  } finally {
    refreshing = false;
  }
}

function showResults(id) {
  person = id;
  entry.hidden = true;
  entry.replaceChildren();
  content.hidden = false;
  identityButton.textContent = personName(catalog, id);
  identityButton.setAttribute('aria-label', `החלפת שם, כרגע ${identityButton.textContent}`);
  document.querySelector('#stats-title').focus();
  render();
  refresh();
}

function showLogin() {
  person = '';
  personal = false;
  personalButton.setAttribute('aria-pressed', 'false');
  filter.value = '';
  filter.closest('label').hidden = false;
  limit = 50;
  if (dialog.open) dialog.close();
  content.hidden = true;
  ranking.replaceChildren();
  summary.replaceChildren();
  entry.hidden = false;
  mountLogin(entry, 'שלב התוצאות', activePeople(catalog), id => {
    identity.set(id);
    showResults(id);
  });
}

async function start() {
  try {
    const response = await fetch('../catalog.json');
    if (!response.ok) throw new Error('catalog');
    catalog = await response.json();
    catalog.people = await createPeopleClient(shared, catalog.people).load();
    if (!shared) store = createLocalStore(catalog, localStorage, sandbox ? 'sandbox' : 'live-local');

    if (sandbox) document.querySelector('.stats-account').insertAdjacentHTML('afterend', '<p class="local-notice">סביבת ניסוי · נתונים נפרדים</p>');
    for (const p of activePeople(catalog)) filter.add(new Option(p.name, p.id));
    const saved = identity.get();
    if (personName(catalog, saved)) showResults(saved);
    else showLogin();
  } catch {
    entry.innerHTML = '<p class="loading" role="status">לא הצלחנו לטעון את שמות המשתתפים. נסו לרענן.</p>';
  }
}

filter.onchange = () => { limit = 50; render(); };
personalButton.onclick = () => {
  personal = !personal;
  personalButton.setAttribute('aria-pressed', String(personal));
  filter.closest('label').hidden = personal;
  limit = 50;
  render();
};
identityButton.onclick = () => {
  identity.clear();
  showLogin();
  entry.querySelector('input').focus();
};
for (const button of sortButtons) {
  button.onclick = () => {
    if (sort === button.dataset.sort) return;
    sort = button.dataset.sort;
    if (!personal) filter.value = '';
    limit = 50;
    for (const option of sortButtons) option.setAttribute('aria-pressed', String(option === button));
    render();
  };
}
window.addEventListener('storage', () => { if (store) refresh(); });
setInterval(() => { if (!document.hidden && shared) refresh(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
start();
