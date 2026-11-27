var e=null;function t(){if(!e){let t=window.AudioContext||window.webkitAudioContext;if(!t)return null;e=new t}return e.state===`suspended`&&e.resume(),e}function n(e,t){let n=e.getBoundingClientRect(),r=Math.min(2,window.devicePixelRatio||1),i=Math.max(1,Math.round(n.width*r)),a=Math.max(1,Math.round(n.height*r));return(e.width!==i||e.height!==a)&&(e.width=i,e.height=a),t.setTransform(r,0,0,r,0,0),{w:n.width,h:n.height}}var r=[{id:`slash`,defaults:{from:900,to:6500,decay:150,q:1.2},knobs:[{key:`from`,min:200,max:3e3,step:10,unit:`Hz`},{key:`to`,min:2e3,max:14e3,step:50,unit:`Hz`},{key:`decay`,min:40,max:500,step:5,unit:`ms`},{key:`q`,min:.3,max:8,step:.1,unit:`Q`}]},{id:`thud`,defaults:{from:150,to:30,drop:90,decay:320},knobs:[{key:`from`,min:60,max:400,step:1,unit:`Hz`},{key:`to`,min:18,max:90,step:1,unit:`Hz`},{key:`drop`,min:15,max:300,step:1,unit:`ms`},{key:`decay`,min:80,max:1200,step:10,unit:`ms`}]},{id:`chant`,defaults:{carrier:220,ratio:1.5,index:3,mix:.45},knobs:[{key:`carrier`,min:80,max:660,step:1,unit:`Hz`},{key:`ratio`,min:.5,max:4,step:.01,unit:`×`},{key:`index`,min:0,max:10,step:.1,unit:`I`},{key:`mix`,min:0,max:1,step:.01,unit:`wet`}]}],i=e=>String(Number.isInteger(e)?e:+e.toFixed(3));function a(e,t,n=1){let r=e.createBuffer(n,Math.ceil(e.sampleRate*t),e.sampleRate);for(let e=0;e<n;e++){let t=r.getChannelData(e);for(let e=0;e<t.length;e++)t[e]=Math.random()*2-1}return r}function o(e,t=2.2,n=3){let r=a(e,t,2);for(let e=0;e<2;e++){let t=r.getChannelData(e);for(let e=0;e<t.length;e++)t[e]*=(1-e/t.length)**n}return r}function s(e,t,n,r){let i=n.currentTime+.01;if(e===`slash`){let e=t.decay/1e3,o=n.createBufferSource();o.buffer=a(n,e+.1);let s=n.createBiquadFilter();s.type=`highpass`,s.Q.value=t.q,s.frequency.setValueAtTime(t.from,i),s.frequency.exponentialRampToValueAtTime(t.to,i+e*.8);let c=n.createGain();return c.gain.setValueAtTime(1e-4,i),c.gain.exponentialRampToValueAtTime(.9,i+.004),c.gain.exponentialRampToValueAtTime(1e-4,i+e),o.connect(s).connect(c).connect(r),o.start(i),o.stop(i+e+.05),e+.05}if(e===`thud`){let e=t.drop/1e3,o=t.decay/1e3,s=n.createOscillator();s.type=`sine`,s.frequency.setValueAtTime(t.from,i),s.frequency.exponentialRampToValueAtTime(t.to,i+e);let c=n.createGain();c.gain.setValueAtTime(1e-4,i),c.gain.exponentialRampToValueAtTime(1,i+.002),c.gain.exponentialRampToValueAtTime(1e-4,i+o),s.connect(c).connect(r),s.start(i),s.stop(i+o+.05);let l=n.createBufferSource();l.buffer=a(n,.06);let u=n.createBiquadFilter();u.type=`lowpass`,u.frequency.value=1200;let d=n.createGain();return d.gain.setValueAtTime(1e-4,i),d.gain.exponentialRampToValueAtTime(.5,i+.002),d.gain.exponentialRampToValueAtTime(1e-4,i+.05),l.connect(u).connect(d).connect(r),l.start(i),l.stop(i+.06),o+.05}let s=1.6,c=n.createOscillator();c.type=`sine`,c.frequency.value=t.carrier;let l=n.createOscillator();l.type=`sine`,l.frequency.value=t.carrier*t.ratio;let u=n.createGain();u.gain.value=t.index*t.carrier*t.ratio;let d=n.createOscillator();d.frequency.value=.8;let f=n.createGain();f.gain.value=u.gain.value*.5,d.connect(f).connect(u.gain),l.connect(u).connect(c.frequency);let p=n.createGain();p.gain.setValueAtTime(1e-4,i),p.gain.exponentialRampToValueAtTime(.35,i+.12),p.gain.setValueAtTime(.35,i+s-.5),p.gain.exponentialRampToValueAtTime(1e-4,i+s);let m=n.createGain();m.gain.value=1-t.mix;let h=n.createGain();h.gain.value=t.mix;let g=n.createConvolver();return g.buffer=o(n),c.connect(p),p.connect(m).connect(r),p.connect(g).connect(h).connect(r),[c,l,d].forEach(e=>{e.start(i),e.stop(i+s)}),3.8000000000000003}function c(e,t){return e===`slash`?`// Zero-Flesh Creation · Codex-01 · https://qianshoulab.github.io/codex/web-audio-formulas/
function slash(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, d = ${i(t.decay/1e3)};
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (d + 0.1)), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;   // white noise
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = ${i(t.q)};
  hp.frequency.setValueAtTime(${i(t.from)}, t);
  hp.frequency.exponentialRampToValueAtTime(${i(t.to)}, t + d * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + d + 0.05);
}`:e===`thud`?`// Zero-Flesh Creation · Codex-01 · https://qianshoulab.github.io/codex/web-audio-formulas/
function thud(ctx = new AudioContext()) {
  const t = ctx.currentTime + 0.01, drop = ${i(t.drop/1e3)}, d = ${i(t.decay/1e3)};
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(${i(t.from)}, t);
  o.frequency.exponentialRampToValueAtTime(${i(t.to)}, t + drop);
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
  const car = ctx.createOscillator(); car.frequency.value = ${i(t.carrier)};
  const mod = ctx.createOscillator(); mod.frequency.value = ${i(t.carrier)} * ${i(t.ratio)};
  const depth = ctx.createGain(); depth.gain.value = ${i(t.index)} * ${i(t.carrier)} * ${i(t.ratio)};
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
  const dry = ctx.createGain(); dry.gain.value = ${i(1-t.mix)};
  const wet = ctx.createGain(); wet.gain.value = ${i(t.mix)};
  car.connect(g); g.connect(dry).connect(ctx.destination);
  g.connect(verb).connect(wet).connect(ctx.destination);
  [car, mod, lfo].forEach((x) => { x.start(t); x.stop(t + len); });
}`}function l(e){let a=e.dataset.compact===`true`,o=`slash`,l=Object.fromEntries(r.map(e=>[e.id,{...e.defaults}])),u=e.querySelector(`[data-scope]`),d=e.querySelector(`[data-code]`),f=null,p=null,m=null,h=null,g=0,_=0,v=null;function y(e){return h||(h=e.createGain(),h.gain.value=.8,m=e.createAnalyser(),m.fftSize=2048,v=new Uint8Array(m.fftSize),h.connect(m),h.connect(e.destination)),h}function b(e){if(g=0,!f||!p)return;let{w:t,h:r}=n(f,p);p.clearRect(0,0,t,r),p.strokeStyle=`rgba(255,255,255,0.07)`,p.lineWidth=1,p.beginPath();for(let e=1;e<8;e++){let n=Math.round(t*e/8)+.5;p.moveTo(n,0),p.lineTo(n,r)}for(let e=1;e<4;e++){let n=Math.round(r*e/4)+.5;p.moveTo(0,n),p.lineTo(t,n)}if(p.stroke(),p.strokeStyle=`#f2f2f2`,p.lineWidth=1.25,p.shadowColor=`rgba(255,255,255,.45)`,p.shadowBlur=5,p.beginPath(),m&&v){m.getByteTimeDomainData(v);for(let e=0;e<v.length;e++){let n=e/(v.length-1)*t,i=r/2+(v[e]-128)/128*(r*.45);e?p.lineTo(n,i):p.moveTo(n,i)}}else p.moveTo(0,r/2),p.lineTo(t,r/2);p.stroke(),p.shadowBlur=0,e<_&&(g=requestAnimationFrame(b))}function x(e=0){_=Math.max(_,performance.now()+e*1e3),!g&&f&&(g=requestAnimationFrame(b))}function S(){!f&&u&&(f=document.createElement(`canvas`),f.setAttribute(`aria-hidden`,`true`),u.prepend(f),p=f.getContext(`2d`),x())}function C(n){let r=t();r&&(x(s(n,l[n],r,y(r))+.2),e.querySelectorAll(`[data-play="${n}"]`).forEach(e=>{e.classList.remove(`hit`),e.offsetWidth,e.classList.add(`hit`)}))}function w(t){o=t,e.querySelectorAll(`[data-pick]`).forEach(e=>e.setAttribute(`aria-pressed`,String(e.dataset.pick===o))),e.querySelectorAll(`[data-knobs]`).forEach(e=>{e.hidden=e.dataset.knobs!==o}),T()}function T(){d&&(d.textContent=c(o,l[o]))}e.querySelectorAll(`[data-play]`).forEach(e=>e.addEventListener(`click`,()=>{let t=e.dataset.play;!a&&t!==o&&w(t),C(t)})),e.querySelectorAll(`[data-pick]`).forEach(e=>e.addEventListener(`click`,()=>w(e.dataset.pick))),e.querySelectorAll(`input[type="range"][data-k]`).forEach(t=>{let[n,r]=(t.dataset.k||``).split(`.`),a=e.querySelector(`[data-v="${n}.${r}"]`),o=()=>{l[n][r]=+t.value,a&&(a.textContent=i(+t.value)),t.style.setProperty(`--p`,String((+t.value-t.min)/(+t.max-t.min)))};o(),t.addEventListener(`input`,()=>{o(),T()}),t.addEventListener(`change`,()=>C(n))}),e.querySelector(`[data-copy]`)?.addEventListener(`click`,async e=>{let t=e.currentTarget;try{await navigator.clipboard.writeText(c(o,l[o])),t.classList.add(`done`),setTimeout(()=>t.classList.remove(`done`),1600)}catch{if(d){let e=document.createRange();e.selectNodeContents(d),getSelection()?.removeAllRanges(),getSelection()?.addRange(e)}}}),window.addEventListener(`resize`,()=>x()),S(),T()}document.querySelectorAll(`[data-bench]`).forEach(e=>{e.dataset.mounted||(e.dataset.mounted=`1`,l(e),e.querySelectorAll(`[data-pick]`).forEach(t=>t.addEventListener(`click`,()=>{e.querySelectorAll(`[data-play-main]`).forEach(e=>{e.hidden=e.dataset.play!==t.dataset.pick})})))});