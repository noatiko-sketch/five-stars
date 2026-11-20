// Production backend: stable participant identities and shared display names.
const FS_SPREADSHEET='YOUR_PRIVATE_SPREADSHEET_ID';
const FS_ORIGIN='https://noatiko-sketch.github.io';
function doGet(e){
 const channel=String(e.parameter.channel||'');if(!/^[a-zA-Z0-9-]{20,80}$/.test(channel))return HtmlService.createHtmlOutput('Five Stars storage service');
 const html='<!doctype html><meta charset="utf-8"><script>const channel='+JSON.stringify(channel)+',origin='+JSON.stringify(FS_ORIGIN)+';window.addEventListener("message",event=>{if(event.origin!==origin||event.source!==window.top||event.data.channel!==channel)return;const request=event.data;google.script.run.withSuccessHandler(result=>window.top.postMessage({channel,id:request.id,result},origin)).withFailureHandler(error=>window.top.postMessage({channel,id:request.id,error:error.message||"Save failed"},origin)).fiveStarsApi(request.path,request.body||{});});window.top.postMessage({channel,ready:true},origin);<\/script>';
 return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function setupFiveStars(){
 const book=SpreadsheetApp.openById(FS_SPREADSHEET);
 let sheet=book.getSheetByName('בחירות האתר');
 if(!sheet){sheet=book.insertSheet('בחירות האתר');sheet.getRange(1,1,1,5).setValues([['מזהה משתתף','בחירות לפי אינדקס שיר','שירים שנראו','גרסה','עודכן בתאריך']]);sheet.getRange(2,1,FS_PEOPLE.length,5).setValues(FS_PEOPLE.map(p=>[p.id,'{}','[]',0,'']));sheet.setFrozenRows(1);}
 return 'Ready';
}
function fiveStarsApi(path,body){
 if(path==='people')return {people:fiveStarsPeople()};
 if(path==='add-person')return fiveStarsAddPerson(body);
 const participants=fiveStarsPeople();
 const sheetName='בחירות האתר';
 if(!['session','state','vote','seen','stats','import','save'].includes(path))throw new Error('פעולה לא נתמכת');
 if(path==='stats')return fiveStarsStats(sheetName);
 const index=participants.findIndex(p=>p.id===body.person&&p.active!==false);if(index<0)throw new Error('יש לבחור שם');
 const lock=index<FS_PEOPLE.length&&['session','state'].includes(path)?null:LockService.getScriptLock();if(lock&&!lock.tryLock(30000))throw new Error('יש עומס רגעי. נסו שוב');
 try{
  const book=SpreadsheetApp.openById(FS_SPREADSHEET);let sheet=book.getSheetByName(sheetName);
  if(!sheet)throw new Error('השמירה עדיין לא הוגדרה');
  const range=fiveStarsParticipantRange(sheet,body.person,index,Boolean(lock));const row=range.getValues()[0];if(row[0]!==body.person)throw new Error('מזהה המשתתף אינו תואם');
  const votes=JSON.parse(row[1]||'{}');let seen=JSON.parse(row[2]||'[]');let revision=Number(row[3])||0;let changed=false;
  if(path==='save'){
   if(!body.votes||typeof body.votes!=='object'||Array.isArray(body.votes))throw new Error('בחירה לא תקינה');
   const proposed={};for(const [id,value]of Object.entries(body.votes)){
    const i=FS_SONGS.findIndex(s=>s.id===id);
    if(i<0||![1,3].includes(value))throw new Error('בחירה לא תקינה');
    if(FS_SONGS[i].people.includes(body.person))throw new Error('אי אפשר להצביע לשיר שלך');
    proposed[i]=value;
   }
   if(Object.values(proposed).filter(v=>v===1).length<10)throw new Error('צריך לבחור לפחות 10 שירים באהבתי');
   if(Object.values(proposed).filter(v=>v===3).length>3)throw new Error('אפשר לבחור עד 3 שירים בממש אהבתי');
   const mappedBase={};for(const [id,value]of Object.entries(body.baseVotes||{})){const i=FS_SONGS.findIndex(s=>s.id===id);if(i>=0)mappedBase[i]=value;}
   const same=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
   if(!same(votes,proposed)&&(!body.baseVotes||!same(votes,mappedBase)))throw new Error('הבחירות השתנו במכשיר אחר. רעננו לפני השמירה');
   if(!same(votes,proposed)){for(const k of Object.keys(votes))delete votes[k];Object.assign(votes,proposed);changed=true;}
  }
  if(path==='vote'){
   const song=FS_SONGS.findIndex(s=>s.id===body.song);if(song<0||![0,1,3].includes(body.value))throw new Error('בחירה לא תקינה');
   if(FS_SONGS[song].people.includes(body.person))throw new Error('אי אפשר להצביע לשיר שלך');
   if(body.value===3&&votes[song]!==3&&Object.values(votes).filter(v=>v===3).length>=3)throw new Error('אפשר לסמן עד 3 שירים בממש אהבתי');
   if(body.value)votes[song]=body.value;else delete votes[song];changed=true;
  }
  if(path==='import'&&Object.keys(votes).length===0){
   if(!body.votes||typeof body.votes!=='object'||Array.isArray(body.votes))throw new Error('בקשה לא תקינה');
   const proposed={};for(const id of Object.keys(body.votes)){const i=FS_SONGS.findIndex(s=>s.id===id);const value=body.votes[id];if(i<0||![1,3].includes(value)||FS_SONGS[i].people.includes(body.person))continue;proposed[i]=value;}
   if(Object.values(proposed).filter(v=>v===3).length>3)throw new Error('הבחירות המקומיות חורגות מהמגבלה');
   Object.assign(votes,proposed);changed=Object.keys(proposed).length>0;
  }
  if(path==='seen'){
   if(!Array.isArray(body.songs)||body.songs.length>100)throw new Error('בקשה לא תקינה');
   const before=seen.length;seen=[...new Set(seen.concat(body.songs.map(id=>FS_SONGS.findIndex(s=>s.id===id)).filter(i=>i>=0)))];changed=before!==seen.length;
  }
  if(changed){revision++;range.setValues([[body.person,JSON.stringify(votes),JSON.stringify(seen),revision,new Date().toISOString()]]);SpreadsheetApp.flush();}
  const mapped={};Object.entries(votes).forEach(([i,value])=>{if(FS_SONGS[i])mapped[FS_SONGS[i].id]=value;});
  return {person:body.person,votes:mapped,seen:seen.filter(i=>FS_SONGS[i]).map(i=>FS_SONGS[i].id),total:FS_SONGS.length,unlocked:false,revision};
 }finally{if(lock)lock.releaseLock();}
}

function fiveStarsStats(sheetName='בחירות האתר'){
 const sheet=SpreadsheetApp.openById(FS_SPREADSHEET).getSheetByName(sheetName);if(!sheet)throw new Error('השמירה עדיין לא הוגדרה');
 const directory=fiveStarsPeople();const people=new Set(directory.filter(p=>p.active!==false).map(p=>p.id));
 const count=Math.max(0,sheet.getLastRow()-1);const entries=count?sheet.getRange(2,1,count,2).getValues():[];
 const songs=FS_SONGS.map(s=>({id:s.id,score:0,likes:0,loves:0,voters:[]}));let participants=0,votes=0;
 for(const row of entries){if(!people.has(row[0]))continue;const ballot=JSON.parse(row[1]||'{}');let voted=false;for(const [index,value] of Object.entries(ballot)){const s=songs[index];if(!s||![1,3].includes(value))continue;s.score+=value===3?2:1;s[value===3?'loves':'likes']++;s.voters.push({person:row[0],value});voted=true;votes++;}if(voted)participants++;}
 return {songs,participants,votes};
}

// Additional names share one directory across production and test. Existing IDs stay unchanged.
function fiveStarsPeople(){
 const sheet=SpreadsheetApp.openById(FS_SPREADSHEET).getSheetByName('משתתפים נוספים');
 if(!sheet||sheet.getLastRow()<2)return FS_PEOPLE.slice();
 const extra=sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues();
 const known=new Set(FS_PEOPLE.map(p=>p.id));
 return FS_PEOPLE.concat(extra.filter(row=>/^u-[a-zA-Z0-9-]+$/.test(row[0])&&typeof row[1]==='string'&&row[1].trim()&&!known.has(row[0])&&known.add(row[0])).map(row=>({id:row[0],name:row[1],active:true})));
}
function fiveStarsAddPerson(body){
 const name=typeof body.name==='string'?body.name.normalize('NFC').trim().replace(/\s+/g,' '):'';
 if(!name||name.length>80||/[\x00-\x1f<>]/.test(name)||/^[=+@-]/.test(name))throw new Error('יש להזין שם תקין, עד 80 תווים');
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))throw new Error('יש עומס רגעי. נסו שוב');
 try{
  const people=fiveStarsPeople();const existing=people.find(p=>String(p.name||'').normalize('NFC').trim().toLocaleLowerCase()===name.toLocaleLowerCase());
  if(existing){if(existing.active===false)throw new Error('השם הזה הוסר מהרשימה');return {person:existing.id,people};}
  const book=SpreadsheetApp.openById(FS_SPREADSHEET);let sheet=book.getSheetByName('משתתפים נוספים');
  if(!sheet){sheet=book.insertSheet('משתתפים נוספים');sheet.getRange(1,1,1,2).setValues([['מזהה','שם תצוגה']]);}
  const person={id:'u-'+Utilities.getUuid(),name,active:true};sheet.getRange(sheet.getLastRow()+1,1,1,2).setValues([[person.id,name]]);SpreadsheetApp.flush();
  return {person:person.id,people:people.concat([person])};
 }finally{lock.releaseLock();}
}

// Locate rows by stable identity when imported participants precede later additions.
function fiveStarsParticipantRange(sheet,person,index,alreadyLocked){
 const direct=sheet.getRange(index+2,1,1,5);if(direct.getValues()[0][0]===person)return direct;
 const find=()=>{const count=Math.max(0,sheet.getLastRow()-1);if(!count)return null;const ids=sheet.getRange(2,1,count,1).getValues();const i=ids.findIndex(row=>row[0]===person);return i<0?null:sheet.getRange(i+2,1,1,5);};
 let range=find();if(range)return range;
 const lock=alreadyLocked?null:LockService.getScriptLock();if(lock&&!lock.tryLock(30000))throw new Error('יש עומס רגעי. נסו שוב');
 try{range=find();if(range)return range;range=sheet.getRange(Math.max(2,sheet.getLastRow()+1),1,1,5);range.setValues([[person,'{}','[]',0,'']]);SpreadsheetApp.flush();return range;}finally{if(lock)lock.releaseLock();}
}

const FS_PEOPLE=[];
const FS_SONGS=[];
