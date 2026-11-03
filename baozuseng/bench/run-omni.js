const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:390,height:844}});
const out={};
for (const [mode, date, rent, key] of [['Moving out','09/18/2026','520','Raj'],['Moving in','09/20/2026','540','Ken'],['Moving in','10/09/2026','450','陈姐'],['Moving in','11/11/2026','760','Amy']]) {
 let taps=0, fields=0;
 await p.goto('https://www.omnicalculator.com/finance/prorated-rent',{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3500);
 await p.getByText(mode,{exact:true}).first().click(); taps++;
 const d=p.locator("input[aria-label^=\"Choose date\"]").first(); await d.click(); taps++; await p.waitForTimeout(500);
 const back=11-(+date.slice(0,2)); for(let i=0;i<back;i++){ await p.getByRole('button',{name:'Previous month'}).click(); taps++; await p.waitForTimeout(350); }
 await p.getByRole('gridcell',{name:String(+date.slice(3,5)),exact:true}).first().click(); taps++; await p.waitForTimeout(300);
 const ok=p.getByRole('button',{name:'OK',exact:true}); if(await ok.count() && await ok.isVisible()){ await ok.click(); taps++; }
 const r=p.locator("[id=\"blockGroups.1.matrices.0.columns.0.0-input\"]"); const txt={nth:()=>p.locator("[id=\"blockGroups.1.matrices.1.columns.0.0-input\"]")}; await r.click(); await r.fill(rent); await r.press('Tab'); fields++;
 await p.waitForTimeout(1200);
 out[key]={value:await txt.nth(1).inputValue(), taps, fields, date: await d.inputValue()};
 if(key==='Raj') await p.screenshot({path:'out/omni-raj.png'});
}
console.log(JSON.stringify(out,null,1)); require('fs').writeFileSync('out/omni-run.json',JSON.stringify(out,null,1)); await b.close(); })();
