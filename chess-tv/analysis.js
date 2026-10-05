// Chess TV: 棋譜の評価ロジック (ブラウザ/Node 共通)
(function (root) {
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-3000, Math.min(3000, cp)))) - 1);
  const cpOf = line => line.cp;

  // SAN の列から各手後の FEN と手の情報を作る
  function buildPositions(Chess, sans) {
    const g = new Chess();
    const fens = [g.fen()], moves = [];
    for (const s of sans) {
      const m = g.move(s);
      if (!m) throw new Error('illegal move: ' + s);
      moves.push({ san: m.san, from: m.from, to: m.to, color: m.color, piece: m.piece, captured: m.captured, uci: m.from + m.to + (m.promotion || '') });
      fens.push(g.fen());
    }
    return { fens, moves };
  }

  function ucisToSans(Chess, ucis) {
    const g = new Chess(), out = [];
    for (const u of ucis) {
      const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (!m) throw new Error('illegal move: ' + u);
      out.push(m.san);
    }
    return out;
  }

  // 詰み・ステイルメイト等はエンジンに頼らず確定させる
  function terminalEval(Chess, fen) {
    const g = new Chess(fen);
    if (g.in_checkmate()) return { terminal: true, depth: 99, lines: [{ cp: -10000, mate: 0, uci: null }] };
    if (g.in_stalemate() || g.insufficient_material()) return { terminal: true, depth: 99, lines: [{ cp: 0, uci: null }] };
    return null;
  }

  // 駒を捨てる手(相手に2点以上得をさせる)かをSEE簡易版で判定
  function isSacrifice(Chess, fenBefore, mv) {
    const g = new Chess(fenBefore);
    const m = g.move({ from: mv.from, to: mv.to, promotion: mv.uci[4] });
    if (!m || m.piece === 'k') return false;
    const gain = m.captured ? VAL[m.captured] : 0;
    let worst = 0;
    for (const c of g.moves({ verbose: true })) {
      if (!c.captured) continue;
      let net = VAL[c.captured];
      g.move(c);
      if (g.moves({ verbose: true }).some(r => r.to === c.to && r.captured)) net -= VAL[c.piece];
      g.undo();
      worst = Math.max(worst, net);
    }
    return worst - gain >= 2;
  }

  const LABELS = {
    brilliant: { sym: '!!', name: 'ブリリアント' },
    great: { sym: '!', name: 'グレート' },
    best: { sym: '★', name: '最善手' },
    excellent: { sym: '', name: '好手' },
    good: { sym: '', name: '妥当' },
    inaccuracy: { sym: '?!', name: '不正確' },
    mistake: { sym: '?', name: 'ミス' },
    blunder: { sym: '??', name: '大悪手' }
  };

  // evPrev: 指す前の局面の評価, evCur: 指した後の局面の評価 (どちらも手番側視点)
  function classifyMove(evPrev, evCur, move, sacrificed) {
    const best = evPrev.lines[0], sec = evPrev.lines[1];
    const wBest = winPct(cpOf(best));
    const wAfter = 100 - winPct(cpOf(evCur.lines[0]));
    const isBest = best.uci === move.uci;
    const loss = isBest ? 0 : Math.max(0, wBest - wAfter);
    let key;
    if (loss >= 20) key = 'blunder';
    else if (loss >= 10) key = 'mistake';
    else if (loss >= 5) key = 'inaccuracy';
    else if (loss >= 2) key = 'good';
    else key = isBest ? 'best' : 'excellent';
    if (loss < 2) {
      if (sacrificed && wBest < 90 && wAfter >= 40) key = 'brilliant';
      else if (isBest && sec && wBest < 95 && wBest - winPct(cpOf(sec)) >= 15) key = 'great';
    }
    return { key, loss, wBest, wAfter, bestUci: best.uci, isBest };
  }

  // lichess 方式の正確度 (勝率損失の平均から)
  function accuracy(losses) {
    if (!losses.length) return null;
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avg) - 3.1669));
  }

  function parseInfo(line) {
    if (!line.startsWith('info') || !/ score /.test(line) || !/ pv /.test(line) || /bound/.test(line)) return null;
    const t = line.split(' ');
    const get = k => { const i = t.indexOf(k); return i < 0 ? null : t[i + 1]; };
    const si = t.indexOf('score'), val = +t[si + 2];
    const r = { mp: +(get('multipv') || 1), depth: +get('depth'), uci: t[t.indexOf('pv') + 1] };
    if (t[si + 1] === 'mate') { r.mate = val; r.cp = (val > 0 ? 1 : -1) * (10000 - Math.abs(val)); } else r.cp = val;
    return r;
  }

  const api = { VAL, winPct, buildPositions, ucisToSans, terminalEval, isSacrifice, classifyMove, accuracy, parseInfo, LABELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChessAnalysis = api;
})(typeof self !== 'undefined' ? self : this);
