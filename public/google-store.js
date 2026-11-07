// Uses an Apps Script HTML bridge so requests do not depend on cross-origin fetch redirects.
export function connectGoogleStore(url){
 const channel=crypto.randomUUID();const waiting=new Map();let bridge,origin;
 let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const startup=setTimeout(()=>readyReject(new Error('לא הצלחנו להתחבר לשמירה. נסו לרענן')),25000);
 window.addEventListener('message',event=>{
  if(!/^https:\/\/[a-zA-Z0-9.-]+\.googleusercontent\.com$/.test(event.origin)||event.data?.channel!==channel)return;
  if(event.data.ready&&!bridge){bridge=event.source;origin=event.origin;clearTimeout(startup);readyResolve();return;}
  if(event.source!==bridge)return;const request=waiting.get(event.data.id);if(!request)return;clearTimeout(request.timer);waiting.delete(event.data.id);
  if(event.data.error)request.reject(new Error(event.data.error));else request.resolve(event.data.result);
 });
 const frame=document.createElement('iframe');frame.hidden=true;frame.title='שמירת בחירות';frame.src=url+'?channel='+encodeURIComponent(channel);document.body.append(frame);
 return async(path,body)=>{await ready;const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('השמירה מתעכבת. הבחירה לא אושרה, נסו שוב'));},30000);waiting.set(id,{resolve,reject,timer});bridge.postMessage({channel,id,path,body},origin);});};
}
