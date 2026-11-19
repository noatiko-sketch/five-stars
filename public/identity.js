export function createIdentity(storage,document,sandbox=false){
 const key=sandbox?'five-stars:identity:shared-test':'five-stars:identity:shared';
 const cookie=sandbox?'five_stars_identity_test':'five_stars_identity';
 return {
  get(){try{const id=storage.getItem(key)||storage.getItem(`five-stars:identity:${sandbox?'sandbox':'live-local'}`);if(id)return id;}catch{}
   try{return decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1)||'');}catch{return '';}
  },
  set(person){try{storage.setItem(key,person);}catch{}document.cookie=`${cookie}=${encodeURIComponent(person)}; Path=/; Max-Age=31536000; SameSite=Lax${globalThis.location?.protocol==='https:'?'; Secure':''}`;},
  clear(){try{storage.removeItem(key);storage.removeItem(`five-stars:identity:${sandbox?'sandbox':'live-local'}`);}catch{}document.cookie=`${cookie}=; Path=/; Max-Age=0; SameSite=Lax`;}
 };
}
