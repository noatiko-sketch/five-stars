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
 if(!['session','state','vote','ballot','seen','stats','import','reset'].includes(path))throw new Error('פעולה לא נתמכת');
 if(path==='stats')return fiveStarsStats();
 if(path==='reset')throw new Error('איפוס סביבת ניסוי דורש הרשאת מנהל');
 const index=FS_PEOPLE.findIndex(p=>p.id===body.person&&p.active!==false);if(index<0)throw new Error('יש לבחור שם');
 if(path==='state'||path==='session')return fiveStarsReadState(body.person,index);
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const sheet=SpreadsheetApp.openById(FS_SPREADSHEET).getSheetByName('בחירות האתר');if(!sheet)throw new Error('השמירה עדיין לא הוגדרה');
  const range=sheet.getRange(index+2,1,1,5);const row=range.getValues()[0];if(row[0]!==body.person)throw new Error('סדר המשתתפים השתנה');
  const votes=JSON.parse(row[1]||'{}');let seen=JSON.parse(row[2]||'[]');let revision=Number(row[3])||0;let changed=false;
  if(path==='ballot'){
   if(!body.votes||typeof body.votes!=='object'||Array.isArray(body.votes)||!body.baseVotes||typeof body.baseVotes!=='object'||Array.isArray(body.baseVotes))throw new Error('בקשה לא תקינה');
   const keys=Object.keys(body.votes), proposed={};
   if(keys.length>FS_SONGS.length)throw new Error('בחירה לא תקינה');
   for(const id of keys){const i=FS_SONGS.findIndex(s=>s.id===id),v=body.votes[id];if(i<0||![1,3].includes(v))throw new Error('בחירה לא תקינה');if(FS_SONGS[i].people.includes(body.person))throw new Error('אי אפשר להצביע לשיר שלך');proposed[i]=v;}
   if(Object.values(proposed).filter(v=>v===1).length<10)throw new Error('צריך לסמן לפחות 10 שירים באהבתי');
   if(Object.values(proposed).filter(v=>v===3).length>3)throw new Error('אפשר לסמן עד 3 שירים בממש אהבתי');
   const current={};Object.entries(votes).forEach(([i,v])=>{if(FS_SONGS[i])current[FS_SONGS[i].id]=v;});
   const signature=x=>JSON.stringify(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)));
   if(signature(current)!==signature(body.baseVotes))throw new Error('הבחירות השתנו במכשיר אחר. רעננו לפני שמירה');
   Object.keys(votes).forEach(k=>delete votes[k]);Object.assign(votes,proposed);changed=true;
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
   if(Object.values(proposed).filter(v=>v===3).length>3||false)throw new Error('הבחירות המקומיות חורגות מהמגבלה');
   Object.assign(votes,proposed);changed=Object.keys(proposed).length>0;
  }
  if(path==='seen'){
   if(!Array.isArray(body.songs)||body.songs.length>100)throw new Error('בקשה לא תקינה');
   const before=seen.length;seen=[...new Set(seen.concat(body.songs.map(id=>FS_SONGS.findIndex(s=>s.id===id)).filter(i=>i>=0)))];changed=before!==seen.length;
  }
  if(changed){revision++;range.setValues([[body.person,JSON.stringify(votes),JSON.stringify(seen),revision,new Date().toISOString()]]);SpreadsheetApp.flush();}
  const mapped={};Object.entries(votes).forEach(([i,value])=>{if(FS_SONGS[i])mapped[FS_SONGS[i].id]=value;});
  return {person:body.person,votes:mapped,seen:seen.filter(i=>FS_SONGS[i]).map(i=>FS_SONGS[i].id),total:FS_SONGS.length,unlocked:false,revision};
 }finally{lock.releaseLock();}
}

function fiveStarsReadState(person,index){
 const sheet=SpreadsheetApp.openById(FS_SPREADSHEET).getSheetByName('בחירות האתר');if(!sheet)throw new Error('השמירה עדיין לא הוגדרה');
 const row=sheet.getRange(index+2,1,1,5).getValues()[0];if(row[0]!==person)throw new Error('סדר המשתתפים השתנה');
 const ballot=JSON.parse(row[1]||'{}'),seen=JSON.parse(row[2]||'[]'),votes={};
 Object.entries(ballot).forEach(([i,v])=>{if(FS_SONGS[i])votes[FS_SONGS[i].id]=v;});
 return {person,votes,seen:seen.filter(i=>FS_SONGS[i]).map(i=>FS_SONGS[i].id),total:FS_SONGS.length,unlocked:seen.length===FS_SONGS.length,revision:Number(row[3])||0};
}
function fiveStarsStats(){
 const sheet=SpreadsheetApp.openById(FS_SPREADSHEET).getSheetByName('בחירות האתר');if(!sheet)throw new Error('השמירה עדיין לא הוגדרה');
 const people=new Set(FS_PEOPLE.filter(p=>p.active!==false).map(p=>p.id));
 const entries=sheet.getRange(2,1,FS_PEOPLE.length,2).getValues();
 const songs=FS_SONGS.map(s=>({id:s.id,score:0,likes:0,loves:0,voters:[]}));let participants=0,votes=0;
 for(const row of entries){if(!people.has(row[0]))continue;const ballot=JSON.parse(row[1]||'{}');let voted=false;for(const [index,value] of Object.entries(ballot)){const s=songs[index];if(!s||![1,3].includes(value))continue;s.score+=value===3?2:1;s[value===3?'loves':'likes']++;s.voters.push({person:row[0],value});voted=true;votes++;}if(voted)participants++;}
 return {songs,participants,votes};
}

// The deployed owner-controlled script is populated from the catalog at deployment time.
// No participant dataset is duplicated in this public server template.
const FS_PEOPLE=[];
const FS_SONGS=[];
