const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:390,height:844}});
const g=require('fs').readFileSync('out/spliit-group.txt','utf8'); const log={};
let taps=0, fields=0; const tap=async l=>{await l.first().click();taps++;await p.waitForTimeout(250)}; const type=async(l,t)=>{await l.first().fill(String(t));fields++;await p.waitForTimeout(100)};
const pick=async(comboIdx,opt)=>{ await tap(p.getByRole('combobox').nth(comboIdx)); await tap(p.getByRole('option',{name:opt,exact:true})); };
const SKIP_ELEC=process.argv[2]==='rentonly';
if(!SKIP_ELEC){await p.goto(g+'/expenses/create',{waitUntil:'networkidle'}); taps++;
await type(p.locator('input[name=title]'),'9月电费'); await type(p.locator('input[name=amount]'),'301.75');
const combos=await p.getByRole('combobox').allTextContents(); console.log(combos);
const payIdx=combos.findIndex(t=>/Select a participant/.test(t)); await pick(payIdx,'房东');
await tap(p.getByRole('button',{name:'Advanced splitting options…'}));
const c2=await p.getByRole('combobox').allTextContents(); await pick(c2.findIndex(t=>/Evenly/.test(t)),'Unevenly – By shares');
await p.screenshot({path:'out/spliit-shares.png',fullPage:true});
const shares={'房东':30,'阿明':30,'小美':0,'阿强':30,'阿杰':30,'Raj':18,'Ken':11};
const si=await p.locator('input').evaluateAll(es=>es.map((e,i)=>({i,t:e.type,n:e.name,v:e.value,vis:!!e.offsetParent})));
const shareIdx=si.filter(x=>x.vis&&x.t!=='checkbox'&&!x.n&&x.v==='1').map(x=>x.i);
console.log('shareInputs',si.filter(x=>x.vis&&x.t!=='checkbox').map(x=>x.n+'='+x.v).join(' '));
const order=['房东','阿明','小美','阿强','阿杰','Raj','Ken'];
for(let k=0;k<order.length;k++){ const v=shares[order[k]]; if(v===0) await tap(p.locator('label',{hasText:/^小美/})); else await type(p.locator('input').nth(shareIdx[k]),v); }
await p.screenshot({path:'out/spliit-shares-filled.png',fullPage:true});
await tap(p.getByRole('button',{name:'Create'})); await p.waitForURL(/expenses$/,{timeout:30000}).catch(()=>{});
log.elec={taps,fields};}
// one rent expense: Raj prorated by hand
taps=0;fields=0;
await p.goto(g+'/expenses/create',{waitUntil:'networkidle'}); taps++;
await type(p.locator('input[name=title]'),'Raj 9月房租'); await type(p.locator('input[name=amount]'),'312');
const c3=await p.getByRole('combobox').allTextContents(); const pi=c3.findIndex(t=>/Select a participant|房东|阿明/.test(t)); if(!/房东/.test(c3[pi])) await pick(pi,'房东');
await tap(p.getByRole('button',{name:'Select none'}));
await tap(p.locator('label',{hasText:/^Raj/}));
await tap(p.getByRole('button',{name:'Create'})); await p.waitForURL(/expenses$/,{timeout:30000}).catch(()=>{});
log.rent={taps,fields};
const t0=Date.now(); await p.goto(g+'/balances',{waitUntil:'networkidle'}); log.balLoad=Date.now()-t0; await p.waitForTimeout(1500);
await p.screenshot({path:'out/spliit-balances.png',fullPage:true});
log.text=(await p.locator('main').innerText()).slice(0,1500);
console.log(JSON.stringify(log,null,1)); require('fs').writeFileSync('out/spliit-run.json',JSON.stringify(log,null,1));
await b.close(); })();
