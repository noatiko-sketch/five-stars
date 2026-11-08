import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
export function createApp({ directory = process.env.DATA_DIR || join(root, 'runtime'), catalog = JSON.parse(readFileSync(join(root, 'data/catalog.json'))) } = {}) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'choices.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, person TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS votes(person TEXT NOT NULL, song TEXT NOT NULL, value INTEGER NOT NULL CHECK(value IN(1,3)), PRIMARY KEY(person,song));
    CREATE TABLE IF NOT EXISTS seen(person TEXT NOT NULL, song TEXT NOT NULL, PRIMARY KEY(person,song));`);
  const people = new Map(catalog.people.map(p => [p.id, p]));
  const songs = new Map(catalog.songs.map(s => [s.id, s]));
  const error = (message, status = 400) => Object.assign(new Error(message), { status });
  let revision = 0;
  function state(person) {
    const seen = db.prepare('SELECT song FROM seen WHERE person=?').all(person).map(r => r.song).filter(id => songs.has(id));
    return { person, revision: ++revision, votes: Object.fromEntries(db.prepare('SELECT song,value FROM votes WHERE person=?').all(person).map(r => [r.song,r.value])), seen, total: songs.size, unlocked: seen.length === songs.size };
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
    try {
      if (!url.pathname.startsWith('/api/')) {
        const paths = { '/':'index.html', '/app.js':'app.js', '/local-store.js':'local-store.js','/google-store.js':'google-store.js', '/style.css':'style.css' };
        const file = paths[url.pathname];
        if (!file) throw error('לא נמצא',404);
        res.writeHead(200, {'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});
        return res.end(readFileSync(join(root,'public',file)));
      }
      let body = {};
      if (req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`) throw error('מקור בקשה לא מורשה',403);
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw error('בקשה גדולה מדי',413); }
        try { body = JSON.parse(raw || '{}'); } catch { throw error('בקשה לא תקינה'); }
      }
      if (url.pathname === '/api/catalog' && req.method === 'GET') return send(200, catalog);
      if (url.pathname === '/api/session' && req.method === 'POST') {
        if (!people.has(body.person)) throw error('צריך לבחור שם מהרשימה');
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?)').run(token,body.person);
        res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);
        return send(200,state(body.person));
      }
      const token = /(?:^|;\s*)session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
      const person = db.prepare('SELECT person FROM sessions WHERE token=?').get(token || '')?.person;
      if (!person) throw error('יש לבחור מי אני',401);
      if (url.pathname === '/api/state' && req.method === 'GET') return send(200,state(person));
      if (url.pathname === '/api/seen' && req.method === 'POST') {
        if (!Array.isArray(body.songs) || body.songs.length > 100 || body.songs.some(id => !songs.has(id))) throw error('רשימת שירים לא תקינה');
        db.exec('BEGIN IMMEDIATE');
        try { const insert = db.prepare('INSERT OR IGNORE INTO seen VALUES(?,?)'); for (const id of body.songs) insert.run(person,id); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
        return send(200,state(person));
      }
      if (url.pathname === '/api/vote' && req.method === 'POST') {
        const song = songs.get(body.song);
        if (!song || ![0,1,3].includes(body.value)) throw error('בחירה לא תקינה');
        if (song.shares.some(s => s.person === person)) throw error('אי אפשר להצביע לשיר ששיתפת',403);
        db.exec('BEGIN IMMEDIATE');
        try {
          const count = db.prepare('SELECT count(*) AS n FROM votes WHERE person=? AND value=? AND song<>?').get(person,body.value,body.song).n;
          if (body.value === 1 && count >= 10) throw error('אפשר לבחור עד עשרה שירים באהבתי',409);
          if (body.value === 3 && count >= 3) throw error('אפשר לבחור עד שלושה שירים בממש אהבתי',409);
          if (body.value === 0) db.prepare('DELETE FROM votes WHERE person=? AND song=?').run(person,body.song);
          else db.prepare('INSERT INTO votes VALUES(?,?,?) ON CONFLICT(person,song) DO UPDATE SET value=excluded.value').run(person,body.song,body.value);
          db.exec('COMMIT');
        } catch(e) { db.exec('ROLLBACK'); throw e; }
        return send(200,state(person));
      }
      if (url.pathname === '/api/stats' && req.method === 'GET') {
        if (!state(person).unlocked) throw error('התוצאות ייפתחו אחרי מעבר על כל השירים',403);
        const votes = db.prepare('SELECT person,song,value FROM votes').all().filter(v => songs.has(v.song));
        const ranked = catalog.songs.map(s => { const entries=votes.filter(v=>v.song===s.id);return {id:s.id,score:entries.reduce((a,v)=>a+(v.value===3?2:1),0),likes:entries.filter(v=>v.value===1).length,loves:entries.filter(v=>v.value===3).length,voters:entries.map(v=>({person:v.person,value:v.value}))}; }).sort((a,b)=>b.score-a.score || b.loves-a.loves || a.id.localeCompare(b.id));
        const contributors=catalog.people.map(p=>({person:p.id,score:ranked.reduce((a,r)=>a+(songs.get(r.id).shares.some(s=>s.person===p.id)?r.score:0),0)})).sort((a,b)=>b.score-a.score);
        return send(200,{songs:ranked,contributors,votes:votes.length,participants:new Set(votes.map(v=>v.person)).size});
      }
      throw error('לא נמצא',404);
    } catch (e) { send(e.status || 500,{error:e.status ? e.message : 'השמירה נכשלה. נסו שוב'}); }
  });
  return { server, close:()=>db.close() };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args=process.argv; const port=Number(process.env.PORT || (args.includes('--port')?args[args.indexOf('--port')+1]:4173));
  createApp().server.listen(port,'0.0.0.0',()=>console.log(`Five Stars listening on ${port}`));
}
