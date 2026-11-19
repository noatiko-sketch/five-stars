export const activePeople=catalog=>catalog.people.filter(p=>p.active!==false);
export const personName=(catalog,id)=>activePeople(catalog).find(p=>p.id===id)?.name||'';
export const songNames=(catalog,song)=>[...new Set(song.shares.map(s=>personName(catalog,s.person)).filter(Boolean))].join(' · ')||'מהקבוצה';
export function createPeopleClient(request,initial){
 let people=initial,supported=false;
 function accept(result){if(!Array.isArray(result.people)||result.people.some(p=>!p.id||typeof p.name!=='string')||new Set(result.people.map(p=>p.id)).size!==result.people.length)throw new Error('רשימת השמות לא תקינה');people=result.people;return people;}
 return {
  get supported(){return supported;},
  async load(){if(!request)return people;try{const result=await request('people',{});accept(result);supported=true;return people;}catch(e){if(/פעולה לא נתמכת/.test(e.message)){supported=false;return people;}throw e;}},
  async add(name){if(!supported)throw new Error('הוספת שמות עדיין לא הופעלה');const result=await request('add-person',{name});accept(result);return result;}
 };
}
