// 全站共用的一小段：EN / 中文、肉身 / 无头、界面音效、页脚纯洁度检疫仪、无头模式的结构树。
// 第一帧之前的语言和模式由 BaseLayout 头上那段内联脚本定好（不闪），这里只管点了以后的事。
import { blip, isMuted, setMuted } from './microSfx';
import { frameBook } from '../components/labs/wire';

const root = document.documentElement;
const LANG_KEY = 'qianshou.lang';          // 跟千手院总舵共用：在这边选了中文，进山门也是中文
const MODE_KEY = 'zero.mode';

// —— 语言 ——
function syncLang() {
  const l = root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
  document.querySelectorAll<HTMLButtonElement>('[data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === l)));
  document.querySelectorAll<HTMLElement>('[data-aria-en]').forEach((el) => {
    const v = el.getAttribute(l === 'zh' ? 'data-aria-zh' : 'data-aria-en');
    if (v) el.setAttribute('aria-label', v);
  });
  const tt = document.querySelector<HTMLMetaElement>(`meta[name="zero:title-${l}"]`);
  if (tt) document.title = tt.content;
}
function setLang(l: 'en' | 'zh') {
  if (root.getAttribute('data-lang') === l) return;
  root.setAttribute('data-lang', l);
  root.lang = l === 'zh' ? 'zh-CN' : 'en';
  try { localStorage.setItem(LANG_KEY, l); } catch { /* 无痕模式 */ }
  syncLang();
  if (root.getAttribute('data-mode') === 'headless') dump();
  document.dispatchEvent(new CustomEvent('zero:lang'));
  scheduleScan();
}

// —— 肉身 / 无头 ——
function syncMode() {
  const m = root.getAttribute('data-mode') === 'headless' ? 'headless' : 'render';
  document.querySelectorAll<HTMLButtonElement>('[data-mode-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === m)));
  if (m === 'headless') dump(); else document.getElementById('hl-dump')?.remove();
}
function setMode(m: 'render' | 'headless') {
  if (root.getAttribute('data-mode') === m) return;
  root.setAttribute('data-mode', m);
  try { localStorage.setItem(MODE_KEY, m); } catch { /* 同上 */ }
  document.dispatchEvent(new CustomEvent('zero:mode'));      // 各个 canvas 自己听：无头就销毁，肉身就重建
  syncMode();
  scheduleScan();
}

// 无头模式：页面顶上吐一份纯文本结构树——字数、帧耗时、标题层级
function visible(el: Element) { return (el as HTMLElement).getClientRects().length > 0; }
function dump() {
  const main = document.getElementById('main');
  if (!main) return;
  document.getElementById('hl-dump')?.remove();
  const zh = root.getAttribute('data-lang') === 'zh';
  const W = (en: string, z: string) => (zh ? z : en);
  // 按标题分段数字符：走一遍正文的文字节点，碰到 h1–h3 就开新的一段
  type Node = { level: number; text: string; chars: number };
  const out: Node[] = [{ level: 0, text: location.pathname, chars: 0 }];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        const el = n as Element;
        if (el.id === 'hl-dump' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE') return NodeFilter.FILTER_REJECT;
        if (!visible(el) && el.tagName !== 'BR') return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let curr = out[0];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 1) {
      const m = /^H([1-3])$/.exec((n as Element).tagName);
      if (m) { curr = { level: +m[1], text: ((n as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(), chars: 0 }; out.push(curr); }
    } else {
      curr.chars += Array.from((n.nodeValue || '').replace(/\s+/g, '')).length;
    }
  }
  const total = out.reduce((s, x) => s + x.chars, 0);
  const fb = frameBook();
  const avg = fb.frames ? (fb.total / fb.frames).toFixed(2) : null;
  const lines: string[] = [];
  lines.push(W('HEADLESS MODE · renderer destroyed', '无头模式 · 渲染器已销毁'));
  lines.push(`${W('canvases destroyed', '画布已销毁')}: ${fb.canvases}   ·   ${W('render frames before collapse', '坍缩前渲染帧数')}: ${fb.frames}`);
  lines.push(avg
    ? `${W('avg frame time', '平均帧耗时')}: ${avg} ms   ·   ${W('last frame', '最后一帧')}: ${fb.last.toFixed(2)} ms   ·   ${W('frames now', '当前帧数')}: 0/s`
    : W('no render loop ran on this page', '这一页没有跑过渲染循环'));
  lines.push(`${W('text', '正文')}: ${total.toLocaleString('en-US')} ${W('chars', '字')}   ·   DOM ${document.getElementsByTagName('*').length} ${W('nodes', '个节点')}`);
  lines.push('');
  lines.push(W('text structure', '纯文本结构树') + ':');
  const shown = out.filter((x, i) => i === 0 || x.text);
  shown.forEach((x, i) => {
    const pad = x.level === 0 ? '' : '  '.repeat(x.level - 1) + (i === shown.length - 1 ? '└─ ' : '├─ ');
    const name = x.level === 0 ? x.text : `h${x.level} ${x.text.length > 64 ? x.text.slice(0, 63) + '…' : x.text}`;
    lines.push(`${pad}${name}  [${x.chars.toLocaleString('en-US')}]`);
  });
  const box = document.createElement('div');
  box.id = 'hl-dump';
  box.className = 'wrap hl-box';
  const pre = document.createElement('pre');
  pre.className = 'hl-dump';
  pre.setAttribute('aria-label', W('Page structure', '页面结构'));
  pre.textContent = lines.join('\n');
  box.appendChild(pre);
  main.prepend(box);
}

// —— 纯洁度检疫仪：PerformanceObserver 收每一个请求，DOM 再扫一遍 ——
const IMG = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|heic)(\?|#|$)/i;
const AUD = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|mp4|webm|mov|mid|midi)(\?|#|$)/i;
const FNT = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;
const MSH = /\.(glb|gltf|fbx|obj|stl|usdz?|ply|dae|3ds|blend|vrm)(\?|#|$)/i;
const net = { img: 0, audio: 0, font: 0, mesh: 0, bytes: 0 };
const seen = new Set<string>();
function take(e: PerformanceResourceTiming) {
  const id = e.name + '@' + e.startTime.toFixed(1);
  if (seen.has(id)) return;
  seen.add(id);
  net.bytes += e.transferSize || e.encodedBodySize || 0;
  const u = e.name, t = e.initiatorType;
  if (/^(data|blob):/.test(u)) return;
  if (MSH.test(u)) net.mesh++;
  else if (FNT.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(u)) net.font++;
  else if (AUD.test(u) || t === 'audio' || t === 'video') net.audio++;
  else if (IMG.test(u) || t === 'img' || t === 'image' || t === 'icon') net.img++;
}
let scanTimer = 0;
function scheduleScan() { clearTimeout(scanTimer); scanTimer = window.setTimeout(scan, 250); }
function scan() {
  const box = document.getElementById('purity');
  if (!box) return;
  let domImg = document.querySelectorAll('img, picture, image, object, embed, iframe').length;
  const domAud = document.querySelectorAll('audio, video, source, track').length;
  for (const el of Array.from(document.body.getElementsByTagName('*'))) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.includes('url(') && !/url\(["']?data:/.test(bg)) domImg++;
  }
  const faces = document.fonts ? Array.from(document.fonts as unknown as Iterable<FontFace>).length : 0;
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const bytes = net.bytes + (nav ? nav.transferSize || nav.encodedBodySize || 0 : 0);
  const v = {
    img: Math.max(net.img, domImg),
    audio: Math.max(net.audio, domAud),
    font: Math.max(net.font, faces),
    mesh: net.mesh,
    dom: document.getElementsByTagName('*').length,
    kb: bytes ? (bytes / 1024).toFixed(1) + ' KB' : '–',
  };
  const bad = v.img + v.audio + v.font + v.mesh > 0;
  for (const k of Object.keys(v) as (keyof typeof v)[]) {
    const el = box.querySelector<HTMLElement>(`[data-p="${k}"]`);
    if (!el) continue;
    el.textContent = typeof v[k] === 'number' ? (v[k] as number).toLocaleString('en-US') : String(v[k]);
    el.classList.toggle('bad', (k === 'img' || k === 'audio' || k === 'font' || k === 'mesh') && (v[k] as number) > 0);
  }
  box.dataset.state = bad ? 'fail' : 'pass';
  const tpl = document.getElementById('purity-words') as HTMLTemplateElement | null;
  const verdict = box.querySelector<HTMLElement>('[data-p="verdict"]');
  if (tpl && verdict) {
    verdict.replaceChildren(...Array.from(tpl.content.querySelectorAll(bad ? '.w-fail' : '.w-pass')).map((n) => n.cloneNode(true)));
  }
  // 给验收脚本留个机器能读的底
  (window as unknown as { __purity?: unknown }).__purity = { ...v, bytes };
}

function init() {
  syncLang();
  syncMode();
  document.querySelectorAll<HTMLButtonElement>('[data-lang-set]').forEach((b) =>
    b.addEventListener('click', () => { setLang(b.dataset.langSet === 'zh' ? 'zh' : 'en'); blip('lang'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-mode-set]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.v === 'headless' ? 'headless' : 'render';
      if (root.getAttribute('data-mode') === m) return;
      // 进无头前「啪」一声断电；回肉身后再「嗡」一声上电（无头态本身不出声）
      if (m === 'headless') { blip('off'); setMode(m); } else { setMode(m); blip('on'); }
    }));
  const sfx = document.querySelector<HTMLButtonElement>('[data-sfx-toggle]');
  if (sfx) {
    sfx.setAttribute('aria-pressed', String(!isMuted()));
    sfx.addEventListener('click', () => {
      const m = !isMuted();
      setMuted(m);
      sfx.setAttribute('aria-pressed', String(!m));
      if (!m) blip('toggle');
    });
  }
  // 其它能点的（链接卡片、分段、筛选）轻轻一声
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest('[data-sfx]') as HTMLElement | null;
    if (el) blip((el.dataset.sfx as 'tick' | 'toggle' | 'open') || 'tick');
  });

  try {
    new PerformanceObserver((list) => { list.getEntries().forEach((x) => take(x as PerformanceResourceTiming)); scheduleScan(); })
      .observe({ type: 'resource', buffered: true });
  } catch {
    performance.getEntriesByType('resource').forEach((x) => take(x as PerformanceResourceTiming));
  }
  // 页脚自己改数、取景框每半秒改 fps，都不算「页面变了」：带 data-noscan 的地方不触发重扫，不然自己追自己的尾巴
  new MutationObserver((recs) => {
    if (recs.some((r) => {
      const el = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      return !el || !el.closest('[data-noscan]');
    })) scheduleScan();
  }).observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'complete') scheduleScan(); else window.addEventListener('load', scheduleScan);
  document.addEventListener('zero:rescan', scheduleScan);
}

init();
