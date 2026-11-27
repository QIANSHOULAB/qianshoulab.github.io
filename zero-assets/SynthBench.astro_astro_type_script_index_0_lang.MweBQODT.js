import{t as e}from"./microSfx.THscNmD1.js";import{i as t,o as n,r}from"./wire.DPjIXXI8.js";var i=[{id:`slash`,defaults:{from:900,to:6500,decay:150,q:1.2},knobs:[{key:`from`,min:200,max:3e3,step:10,unit:`Hz`},{key:`to`,min:2e3,max:14e3,step:50,unit:`Hz`},{key:`decay`,min:40,max:500,step:5,unit:`ms`},{key:`q`,min:.3,max:8,step:.1,unit:`Q`}]},{id:`thud`,defaults:{from:150,to:30,drop:90,decay:320},knobs:[{key:`from`,min:60,max:400,step:1,unit:`Hz`},{key:`to`,min:18,max:90,step:1,unit:`Hz`},{key:`drop`,min:15,max:300,step:1,unit:`ms`},{key:`decay`,min:80,max:1200,step:10,unit:`ms`}]},{id:`chant`,defaults:{carrier:220,ratio:1.5,index:3,mix:.45},knobs:[{key:`carrier`,min:80,max:660,step:1,unit:`Hz`},{key:`ratio`,min:.5,max:4,step:.01,unit:`×`},{key:`index`,min:0,max:10,step:.1,unit:`I`},{key:`mix`,min:0,max:1,step:.01,unit:`wet`}]}],a=e=>String(Number.isInteger(e)?e:+e.toFixed(3));function o(e,t,n=1){let r=e.createBuffer(n,Math.ceil(e.sampleRate*t),e.sampleRate);for(let e=0;e<n;e++){let t=r.getChannelData(e);for(let e=0;e<t.length;e++)t[e]=Math.random()*2-1}return r}function s(e,t=2.2,n=3){let r=o(e,t,2);for(let e=0;e<2;e++){let t=r.getChannelData(e);for(let e=0;e<t.length;e++)t[e]*=(1-e/t.length)**n}return r}function c(e,t,n,r){let i=n.currentTime+.01;if(e===`slash`){let e=t.decay/1e3,a=n.createBufferSource();a.buffer=o(n,e+.1);let s=n.createBiquadFilter();s.type=`highpass`,s.Q.value=t.q,s.frequency.setValueAtTime(t.from,i),s.frequency.exponentialRampToValueAtTime(t.to,i+e*.8);let c=n.createGain();return c.gain.setValueAtTime(1e-4,i),c.gain.exponentialRampToValueAtTime(.9,i+.004),c.gain.exponentialRampToValueAtTime(1e-4,i+e),a.connect(s).connect(c).connect(r),a.start(i),a.stop(i+e+.05),e+.05}if(e===`thud`){let e=t.drop/1e3,a=t.decay/1e3,s=n.createOscillator();s.type=`sine`,s.frequency.setValueAtTime(t.from,i),s.frequency.exponentialRampToValueAtTime(t.to,i+e);let c=n.createGain();c.gain.setValueAtTime(1e-4,i),c.gain.exponentialRampToValueAtTime(1,i+.002),c.gain.exponentialRampToValueAtTime(1e-4,i+a),s.connect(c).connect(r),s.start(i),s.stop(i+a+.05);let l=n.createBufferSource();l.buffer=o(n,.06);let u=n.createBiquadFilter();u.type=`lowpass`,u.frequency.value=1200;let d=n.createGain();return d.gain.setValueAtTime(1e-4,i),d.gain.exponentialRampToValueAtTime(.5,i+.002),d.gain.exponentialRampToValueAtTime(1e-4,i+.05),l.connect(u).connect(d).connect(r),l.start(i),l.stop(i+.06),a+.05}let a=1.6,c=n.createOscillator();c.type=`sine`,c.frequency.value=t.carrier;let l=n.createOscillator();l.type=`sine`,l.frequency.value=t.carrier*t.ratio;let u=n.createGain();u.gain.value=t.index*t.carrier*t.ratio;let d=n.createOscillator();d.frequency.value=.8;let f=n.createGain();f.gain.value=u.gain.value*.5,d.connect(f).connect(u.gain),l.connect(u).connect(c.frequency);let p=n.createGain();p.gain.setValueAtTime(1e-4,i),p.gain.exponentialRampToValueAtTime(.35,i+.12),p.gain.setValueAtTime(.35,i+a-.5),p.gain.exponentialRampToValueAtTime(1e-4,i+a);let m=n.createGain();m.gain.value=1-t.mix;let h=n.createGain();h.gain.value=t.mix;let g=n.createConvolver();return g.buffer=s(n),c.connect(p),p.connect(m).connect(r),p.connect(g).connect(h).connect(r),[c,l,d].forEach(e=>{e.start(i),e.stop(i+a)}),3.8000000000000003}function l(e,t){return e===`slash`?`// Zero-Flesh Creation · Codex-01 · https://qianshoulab.github.io/codex/web-audio-formulas/
function slash(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, d = ${a(t.decay/1e3)};
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (d + 0.1)), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;   // white noise
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = ${a(t.q)};
  hp.frequency.setValueAtTime(${a(t.from)}, t);
  hp.frequency.exponentialRampToValueAtTime(${a(t.to)}, t + d * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + d + 0.05);
}`:e===`thud`?`// Zero-Flesh Creation · Codex-01 · https://qianshoulab.github.io/codex/web-audio-formulas/
function thud(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, drop = ${a(t.drop/1e3)}, d = ${a(t.decay/1e3)};
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(${a(t.from)}, t);
  o.frequency.exponentialRampToValueAtTime(${a(t.to)}, t + drop);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.05);
  // a pinch of low-passed noise for the meat
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const n = ctx.createBufferSource(); n.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(lp).connect(ng).connect(ctx.destination); n.start(t); n.stop(t + 0.06);
}`:`// Zero-Flesh Creation · Codex-01 · https://qianshoulab.github.io/codex/web-audio-formulas/
function chant(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, len = 1.6;
  const car = ctx.createOscillator(); car.frequency.value = ${a(t.carrier)};
  const mod = ctx.createOscillator(); mod.frequency.value = ${a(t.carrier)} * ${a(t.ratio)};
  const depth = ctx.createGain(); depth.gain.value = ${a(t.index)} * ${a(t.carrier)} * ${a(t.ratio)};
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8;            // the breathing
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = depth.gain.value * 0.5;
  lfo.connect(lfoAmt).connect(depth.gain);
  mod.connect(depth).connect(car.frequency);                                 // FM
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  g.gain.setValueAtTime(0.35, t + len - 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  // reverb: the impulse response is just stereo noise times a decay curve
  const ir = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2.2), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const dry = ctx.createGain(); dry.gain.value = ${a(1-t.mix)};
  const wet = ctx.createGain(); wet.gain.value = ${a(t.mix)};
  car.connect(g); g.connect(dry).connect(ctx.destination);
  g.connect(verb).connect(wet).connect(ctx.destination);
  [car, mod, lfo].forEach((x) => { x.start(t); x.stop(t + len); });
}`}function u(o){let s=o.dataset.compact===`true`,u=`slash`,d=Object.fromEntries(i.map(e=>[e.id,{...e.defaults}])),f=o.querySelector(`[data-scope]`),p=o.querySelector(`[data-code]`),m=null,h=null,g=null,_=null,v=0,y=0,b=null;function x(e){return _||(_=e.createGain(),_.gain.value=.8,g=e.createAnalyser(),g.fftSize=2048,b=new Uint8Array(g.fftSize),_.connect(g),_.connect(e.destination)),_}function S(e){if(v=0,!m||!h)return;let n=performance.now(),{w:i,h:a}=r(m,h);h.clearRect(0,0,i,a),h.strokeStyle=`rgba(230,237,243,0.07)`,h.lineWidth=1,h.beginPath();for(let e=1;e<8;e++){let t=Math.round(i*e/8)+.5;h.moveTo(t,0),h.lineTo(t,a)}for(let e=1;e<4;e++){let t=Math.round(a*e/4)+.5;h.moveTo(0,t),h.lineTo(i,t)}if(h.stroke(),h.strokeStyle=`#00FF9D`,h.lineWidth=1.5,h.shadowColor=`rgba(0,255,157,.6)`,h.shadowBlur=6,h.beginPath(),g&&b){g.getByteTimeDomainData(b);for(let e=0;e<b.length;e++){let t=e/(b.length-1)*i,n=a/2+(b[e]-128)/128*(a*.45);e?h.lineTo(t,n):h.moveTo(t,n)}}else h.moveTo(0,a/2),h.lineTo(i,a/2);h.stroke(),h.shadowBlur=0,t().add(performance.now()-n),e<y&&(v=requestAnimationFrame(S))}function C(e=0){y=Math.max(y,performance.now()+e*1e3),!v&&m&&(v=requestAnimationFrame(S))}function w(){m||n()||!f||(m=document.createElement(`canvas`),m.setAttribute(`aria-hidden`,`true`),f.prepend(m),h=m.getContext(`2d`),t().canvases++,C())}function T(){m&&(cancelAnimationFrame(v),v=0,m.width=m.height=0,m.remove(),m=null,h=null)}function E(t){let n=e();n&&(C(c(t,d[t],n,x(n))+.2),o.querySelectorAll(`[data-play="${t}"]`).forEach(e=>{e.classList.remove(`hit`),e.offsetWidth,e.classList.add(`hit`)}))}function D(e){u=e,o.querySelectorAll(`[data-pick]`).forEach(e=>e.setAttribute(`aria-pressed`,String(e.dataset.pick===u))),o.querySelectorAll(`[data-knobs]`).forEach(e=>{e.hidden=e.dataset.knobs!==u}),O()}function O(){p&&(p.textContent=l(u,d[u]))}o.querySelectorAll(`[data-play]`).forEach(e=>e.addEventListener(`click`,()=>{let t=e.dataset.play;!s&&t!==u&&D(t),E(t)})),o.querySelectorAll(`[data-pick]`).forEach(e=>e.addEventListener(`click`,()=>D(e.dataset.pick))),o.querySelectorAll(`input[type="range"][data-k]`).forEach(e=>{let[t,n]=(e.dataset.k||``).split(`.`),r=o.querySelector(`[data-v="${t}.${n}"]`),i=()=>{d[t][n]=+e.value,r&&(r.textContent=a(+e.value)),e.style.setProperty(`--p`,String((+e.value-e.min)/(+e.max-e.min)))};i(),e.addEventListener(`input`,()=>{i(),O()}),e.addEventListener(`change`,()=>E(t))}),o.querySelector(`[data-copy]`)?.addEventListener(`click`,async e=>{let t=e.currentTarget;try{await navigator.clipboard.writeText(l(u,d[u])),t.classList.add(`done`),setTimeout(()=>t.classList.remove(`done`),1600)}catch{if(p){let e=document.createRange();e.selectNodeContents(p),getSelection()?.removeAllRanges(),getSelection()?.addRange(e)}}}),document.addEventListener(`zero:mode`,()=>{n()?T():w()}),window.addEventListener(`resize`,()=>C()),w(),O()}document.querySelectorAll(`[data-bench]`).forEach(e=>{e.dataset.mounted||(e.dataset.mounted=`1`,u(e),e.querySelectorAll(`[data-pick]`).forEach(t=>t.addEventListener(`click`,()=>{e.querySelectorAll(`[data-play-main]`).forEach(e=>{e.hidden=e.dataset.play!==t.dataset.pick})})))});