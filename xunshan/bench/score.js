// 对答案：node xunshan/bench/score.js results/ours.json [...]
const fs = require('fs'), path = require('path');
const { W, STEPS } = require('./scenario');
function score(file) {
  const r = JSON.parse(fs.readFileSync(path.resolve(__dirname, file)));
  let miss = 0, fa = 0, hit = 0; const detail = [];
  for (const w of W) {
    const s = r.steps[w.id] || [];
    for (let k = 1; k < STEPS; k++) {
      const want = w.expect.includes(k), got = s[k - 1] === 'alert';
      if (want && got) hit++;
      else if (want) { miss++; detail.push(`${w.id} 第${k}步 漏报（${s[k - 1] || '无'}）`); }
      else if (got) { fa++; detail.push(`${w.id} 第${k}步 误报`); }
    }
  }
  return { tool: r.tool, hit, miss, fa, total: W.reduce((a, w) => a + w.expect.length, 0), detail };
}
const out = process.argv.slice(2).map(score);
for (const o of out) console.log(`${o.tool}: 该叫 ${o.total} 次，叫对 ${o.hit}，漏报 ${o.miss}，误报 ${o.fa}\n  ` + o.detail.join('\n  '));
module.exports = score;
