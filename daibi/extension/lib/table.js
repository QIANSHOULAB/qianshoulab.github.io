/* 千手院通用：读写表格（CSV / TSV / XLSX）。不依赖第三方库，全部在本机解析。
 * 用法：const t = await QSLib.table.read(file, {sheet})
 *   → {name, sheets:[...], sheet, headers:[...], rows:[[...]]}（值一律是字符串）
 * 写：QSLib.table.toCSV(headers, rows) → 带 BOM 的 CSV 文本（Excel 直接打开不乱码）
 */
(function (g) {
  'use strict';

  /* ---------- CSV ---------- */
  function decode(buf) {
    let u8 = new Uint8Array(buf);
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('gb18030').decode(u8); } // 国内 Excel 另存的 CSV 多半是 GBK
  }

  function sniffDelimiter(text) {
    const head = text.slice(0, 4000).split(/\r?\n/).slice(0, 5);
    let best = ',', bestScore = -1;
    for (const d of [',', '\t', ';', '|']) {
      const counts = head.map(l => splitLine(l, d).length);
      const min = Math.min(...counts);
      const same = counts.every(c => c === counts[0]);
      const score = (min > 1 ? min : 0) + (same ? 100 : 0) * (min > 1 ? 1 : 0);
      if (score > bestScore) { best = d; bestScore = score; }
    }
    return best;
  }
  function splitLine(line, d) { return parseDelimited(line, d)[0] || []; }

  function parseDelimited(text, d) {
    const rows = []; let row = [], cell = '', q = false, i = 0;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === '') { q = true; i++; continue; }
      if (ch === d) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
        if (ch === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function parseText(text, name) {
    text = String(text || '').replace(/^﻿/, '');
    const d = sniffDelimiter(text);
    return shape(parseDelimited(text, d), name || '粘贴的表格', [], '');
  }

  /* ---------- ZIP（XLSX 本质是 zip） ---------- */
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('NOT_ZIP');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const td = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + elen + clen;
    }
    return {
      has: n => !!files[n],
      async text(n) {
        const f = files[n]; if (!f) return null;
        const lnl = dv.getUint16(f.off + 26, true), lel = dv.getUint16(f.off + 28, true);
        const start = f.off + 30 + lnl + lel;
        const data = u8.subarray(start, start + f.csize);
        if (f.method === 0) return td.decode(data);
        const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(ds).text();
      }
    };
  }

  /* ---------- XLSX ---------- */
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (el, tag) => Array.from(el.getElementsByTagName(tag));
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);
  const BUILTIN_TIME = new Set([18, 19, 20, 21, 32, 33, 45, 46, 47, 55, 56]);

  function fmtKind(code) {
    const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    const hasD = /[yd]/i.test(c) || /m{3,}/i.test(c) || (/m/i.test(c) && !/[hs]/i.test(c));
    const hasT = /[hs]/i.test(c);
    if (hasD && hasT) return 'datetime';
    if (hasD) return 'date';
    if (hasT) return 'time';
    if (/%/.test(c)) return 'pct';
    return '';
  }

  const pad = n => String(n).padStart(2, '0');
  function serialToStr(v, kind, date1904) {
    let ms = Math.round((v + (date1904 ? 1462 : 0) - 25569) * 864e5);
    const d = new Date(ms);
    const D = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const T = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    if (kind === 'time') return T;
    if (kind === 'datetime') return (d.getUTCHours() || d.getUTCMinutes()) ? `${D} ${T}` : D;
    return D;
  }
  function numStr(v) {
    if (Number.isInteger(v)) return String(v);
    return String(parseFloat(v.toPrecision(15)));
  }
  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
    let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1;
  }

  async function readXlsx(buf, name, want) {
    const z = await unzip(buf);
    const wb = xml(await z.text('xl/workbook.xml'));
    const date1904 = kids(wb, 'workbookPr').some(e => /^(1|true)$/.test(e.getAttribute('date1904') || ''));
    const rels = xml(await z.text('xl/_rels/workbook.xml.rels'));
    const relMap = {};
    kids(rels, 'Relationship').forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
    const sheets = kids(wb, 'sheet').filter(s => s.getAttribute('state') !== 'hidden').map(s => {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let t = relMap[rid] || ''; t = t.replace(/^\/?xl\//, '').replace(/^\//, '');
      return { name: s.getAttribute('name'), path: 'xl/' + t };
    });
    if (!sheets.length) throw new Error('NO_SHEET');

    let ss = [];
    if (z.has('xl/sharedStrings.xml')) {
      ss = kids(xml(await z.text('xl/sharedStrings.xml')), 'si').map(si =>
        kids(si, 't').filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join(''));
    }
    let xfKinds = [];
    if (z.has('xl/styles.xml')) {
      const st = xml(await z.text('xl/styles.xml'));
      const custom = {};
      kids(st, 'numFmt').forEach(f => custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || '');
      const cellXfs = kids(st, 'cellXfs')[0];
      if (cellXfs) xfKinds = kids(cellXfs, 'xf').map(xf => {
        const id = +xf.getAttribute('numFmtId') || 0;
        if (custom[id] != null) return fmtKind(custom[id]);
        if (BUILTIN_DATE.has(id)) return 'date';
        if (BUILTIN_TIME.has(id)) return 'time';
        if (id === 9 || id === 10) return 'pct';
        return '';
      });
    }

    const pick = sheets.find(s => s.name === want) || null;
    const order = pick ? [pick] : sheets;
    let grid = [], used = sheets[0];
    for (const sh of order) {
      const doc = xml(await z.text(sh.path) || '<x/>');
      grid = [];
      kids(doc, 'row').forEach(r => {
        const ri = (+r.getAttribute('r') || grid.length + 1) - 1;
        const row = grid[ri] = grid[ri] || [];
        kids(r, 'c').forEach((c, k) => {
          let ci = colIndex(c.getAttribute('r')); if (ci < 0) ci = k;
          const t = c.getAttribute('t'); const s = +c.getAttribute('s') || 0;
          const vEl = c.getElementsByTagName('v')[0];
          let v = vEl ? vEl.textContent : '';
          if (t === 's') v = ss[+v] ?? '';
          else if (t === 'inlineStr') v = kids(c, 't').map(x => x.textContent).join('');
          else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
          else if (t === 'e' || t === 'str') { /* 原样 */ }
          else if (v !== '') {
            const num = +v, kind = xfKinds[s];
            if (kind === 'date' || kind === 'datetime' || kind === 'time') v = serialToStr(num, kind, date1904);
            else if (kind === 'pct') v = numStr(+(num * 100).toPrecision(12)) + '%';
            else v = numStr(num);
          }
          row[ci] = v;
        });
      });
      used = sh;
      if (pick || grid.some(r => r && r.some(x => x !== '' && x != null))) break;
    }
    for (let i = 0; i < grid.length; i++) grid[i] = Array.from(grid[i] || [], x => x ?? '');
    return shape(grid, name, sheets.map(s => s.name), used.name);
  }

  /* ---------- 统一形状：表头 + 行 ---------- */
  function shape(grid, name, sheets, sheet) {
    const clean = grid.map(r => (r || []).map(x => String(x ?? '').trim()));
    while (clean.length && !clean[clean.length - 1].some(Boolean)) clean.pop();
    let h = 0; while (h < clean.length && !clean[h].some(Boolean)) h++;
    const body = clean.slice(h + 1).filter(r => r.some(Boolean));
    let width = Math.max(0, ...clean.slice(h).map(r => {
      let w = r.length; while (w && !r[w - 1]) w--; return w;
    }));
    const rawH = (clean[h] || []).slice(0, width);
    const seen = {};
    const headers = Array.from({ length: width }, (_, i) => {
      let x = rawH[i] || ('列' + (i + 1));
      if (seen[x]) { seen[x]++; x = x + '_' + seen[x]; } else seen[x] = 1;
      return x;
    });
    const rows = body.map(r => Array.from({ length: width }, (_, i) => r[i] || ''));
    return { name, sheets, sheet, headers, rows };
  }

  async function read(file, opts) {
    opts = opts || {};
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (u8[0] === 0x50 && u8[1] === 0x4B) return readXlsx(buf, file.name, opts.sheet);
    if (u8[0] === 0xD0 && u8[1] === 0xCF) throw new Error('OLD_XLS');
    return parseText(decode(buf), file.name);
  }

  /* ---------- 链接：Google 表格 / 任意 .csv 链接 ---------- */
  function linkInfo(u) {
    u = String(u || '').trim();
    let x; try { x = new URL(u); } catch (e) { return null; }
    if (!/^https?:$/.test(x.protocol)) return null;
    const m = /docs\.google\.com\/spreadsheets\/d\/(e\/)?([\w-]+)/.exec(u);
    if (m) {
      const gid = /[#&?]gid=(\d+)/.exec(u);
      const g = gid ? '&gid=' + gid[1] : '';
      return {
        kind: 'google',
        url: m[1] ? `https://docs.google.com/spreadsheets/d/e/${m[2]}/pub?output=csv${g}` : `https://docs.google.com/spreadsheets/d/${m[2]}/export?format=csv${g}`,
        origins: ['https://docs.google.com/*', 'https://*.googleusercontent.com/*']
      };
    }
    return { kind: 'csv', url: u, origins: [`${x.protocol}//${x.hostname}/*`] };
  }
  // 需要先拿到 linkInfo(u).origins 的网站权限；带上浏览器里已登录的身份（私有 Google 表格只要你登录了就能读）
  async function readUrl(u, fallbackName) {
    const info = linkInfo(u); if (!info) throw new Error('BAD_LINK');
    let r;
    try { r = await fetch(info.url, { credentials: 'include', cache: 'no-store' }); } catch (e) { throw new Error('LINK_FAIL'); }
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 || r.status === 404 ? 'LINK_PRIVATE' : 'LINK_FAIL');
    const ct = r.headers.get('content-type') || '';
    const buf = await r.arrayBuffer();
    const u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    let name = fallbackName || '';
    const cd = r.headers.get('content-disposition') || '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="([^"]+)"/i.exec(cd);
    if (m) { try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; } }
    if (!name) name = decodeURIComponent(new URL(info.url).pathname.split('/').pop() || '') || info.url;
    if (u8[0] === 0x50 && u8[1] === 0x4B) return readXlsx(buf, name);
    const text = decode(buf);
    if (/text\/html/i.test(ct) || /^\s*<(!doctype|html)/i.test(text)) throw new Error('LINK_PRIVATE'); // 跳到登录页了
    return parseText(text, name);
  }

  function toCSV(headers, rows) {
    const esc = v => { v = String(v ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  }

  g.QSLib = g.QSLib || {};
  g.QSLib.table = { read, readUrl, linkInfo, parseText, toCSV, _parseDelimited: parseDelimited };
})(globalThis);
