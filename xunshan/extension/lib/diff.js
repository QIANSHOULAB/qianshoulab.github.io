/* 千手院通用：文字对比。中文按字、英文按词，LCS 出增删。 */
(function (g) {
  const QS = g.QS = g.QS || {};
  const tok = s => String(s || '').match(/\s+|[　-鿿가-힯＀-￯]|[^\s　-鿿가-힯＀-￯]+/g) || [];
  // 返回 [{op:'=','+','-', s}]
  function diff(a, b) {
    let A = tok(a), B = tok(b);
    // 掐头去尾，缩小 LCS 规模
    let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
    let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
    const head = A.slice(0, pre).join(''), tail = A.slice(A.length - suf).join('');
    A = A.slice(pre, A.length - suf); B = B.slice(pre, B.length - suf);
    const out = [];
    if (head) out.push({ op: '=', s: head });
    if (A.length * B.length > 4e6) {
      if (A.length) out.push({ op: '-', s: A.join('') });
      if (B.length) out.push({ op: '+', s: B.join('') });
    } else {
      const n = A.length, m = B.length, W = m + 1;
      const L = new Uint32Array((n + 1) * W);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
        L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      let i = 0, j = 0;
      const push = (op, s) => { const l = out[out.length - 1]; if (l && l.op === op) l.s += s; else out.push({ op, s }); };
      while (i < n && j < m) {
        if (A[i] === B[j]) { push('=', A[i]); i++; j++; }
        else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) push('-', A[i++]);
        else push('+', B[j++]);
      }
      while (i < n) push('-', A[i++]);
      while (j < m) push('+', B[j++]);
    }
    if (tail) { const l = out[out.length - 1]; if (l && l.op === '=') l.s += tail; else out.push({ op: '=', s: tail }); }
    return out;
  }
  QS.diff = diff;
})(typeof globalThis !== 'undefined' ? globalThis : self);
