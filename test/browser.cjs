const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
const {createApp}=await import('../server.js');
const app=createApp({directory:fs.mkdtempSync('/tmp/fivestars-browser-')});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-zygote','--single-process','--disable-crashpad-for-testing','--disable-breakpad','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base);await page.getByPlaceholder('השם שלי').waitFor();
await page.screenshot({path:'/tmp/five-stars-login.png'});
await page.locator('.person').filter({hasText:'Noa Tikochinsky'}).click();
await page.locator('.song').first().waitFor();
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
await page.screenshot({path:'/tmp/five-stars-mobile.png'});
await page.locator('#search').fill('מקהלה');
await page.locator('.choice.like').first().click();
await page.waitForFunction(()=>document.querySelector('.choice.like[aria-pressed="true"]'));
await page.reload();await page.locator('#search').fill('מקהלה');
if(await page.locator('.choice.like').first().getAttribute('aria-pressed')!=='true')throw Error('vote did not persist');
await page.locator('#stats-tab').click();await page.getByRole('status').filter({hasText:'התוצאות ייפתחו'}).waitFor();
await page.locator('#search').fill('');
await page.locator('#sender').selectOption(await page.locator('#sender option').filter({hasText:'Noa Tikochinsky'}).getAttribute('value'));
if(await page.locator('.choice').count())throw Error('own-song voting exposed');
await page.locator('#sender').selectOption('');
await page.locator('#search').fill('zzzzzzzzzzzz');await page.getByText('לא נמצאו שירים').waitFor();
await page.locator('#search').fill('');
await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/five-stars-desktop.png'});
await page.setViewportSize({width:390,height:844});
const loveButtons=page.locator('.choice.love');
for(let i=0;i<3;i++){await loveButtons.nth(i).click();await page.waitForFunction(n=>document.querySelectorAll('.choice.love[aria-pressed="true"]').length===n,i+1);}
await loveButtons.nth(3).click();await page.getByRole('heading',{name:'שלושת הכוכבים שלך'}).waitFor();
await page.getByRole('button',{name:'סגירה'}).click();
// Dedicated browser fixture uses all real UI functions with a small catalog to validate unlock and multi-user live stats.
await browser.close();await new Promise(r=>app.server.close(r));app.close();
if(errors.length)throw Error(errors.join('\n'));
console.log('Browser passed: mobile/desktop layout, session, save/reload, search, own-song controls, locked stats, three-choice dialog; no JS errors');
})();
