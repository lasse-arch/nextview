/* How a site plan lies on a photo, from spots seen on both (nextviewAI finds them - see matchSitePlan). */

/**
 * The perspective that best takes the plan's spots to the photo's (least
 * squares through all the pairs nextviewAI found, the worst ones dropped once
 * if they don't fit) - and how far off the rest are, in % of the photo.
 */
export function fitPlan(pairs: { plan: [number, number]; photo: [number, number] }[]): { h: number[]; err: number; used: number } | null {
  const solve = (ps: typeof pairs) => {
    // a0 x + a1 y + a2 - c0 x X - c1 y X = X, and the same for Y: 8 unknowns, normal equations.
    const A: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
    const b: number[] = Array(8).fill(0);
    const add = (row: number[], t: number) => {
      for (let i = 0; i < 8; i++) {
        b[i] += row[i] * t;
        for (let j = 0; j < 8; j++) A[i][j] += row[i] * row[j];
      }
    };
    for (const { plan: [x, y], photo: [X, Y] } of ps) {
      add([x, y, 1, 0, 0, 0, -x * X, -y * X], X);
      add([0, 0, 0, x, y, 1, -x * Y, -y * Y], Y);
    }
    // Gauss-Jordan.
    for (let c = 0; c < 8; c++) {
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  };
  const at = (h: number[], [x, y]: [number, number]): [number, number] => {
    const d = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
  };
  const miss = (h: number[], p: (typeof pairs)[number]) => Math.hypot(at(h, p.plan)[0] - p.photo[0], at(h, p.plan)[1] - p.photo[1]);
  let ps = pairs;
  let h = ps.length >= 4 ? solve(ps) : null;
  if (!h) return null;
  // The ones far off (a wrong match) out, once - if enough are left.
  const errs = ps.map((p) => miss(h!, p));
  const median = [...errs].sort((a, b) => a - b)[Math.floor(errs.length / 2)];
  const kept = ps.filter((_, i) => errs[i] <= Math.max(3, median * 2.5));
  if (kept.length >= 4 && kept.length < ps.length) {
    const again = solve(kept);
    if (again) [h, ps] = [again, kept];
  }
  const err = ps.reduce((a, p) => a + miss(h!, p), 0) / ps.length;
  return { h, err, used: ps.length };
}
