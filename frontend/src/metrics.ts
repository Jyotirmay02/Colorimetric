// Comprehensive colorimetric metrics library.
// Each metric has a `category` and a `compute()` returning the y-value.
// linearFit() fits y = m*x + c; metrics with logX/logY transform are fit in log-space.

export type RGB = { r: number; g: number; b: number };

export type MetricCategory = "conc-linear" | "logconc-loglinear";

export type Metric = {
  id: string;
  label: string;
  category: MetricCategory; // determines x-axis & y-axis transforms
  needsBlank?: boolean;
  compute: (s: RGB, blank?: RGB) => number;
};

const lum = (s: RGB) => 0.299 * s.r + 0.587 * s.g + 0.112 * s.b;
const sum = (s: RGB) => s.r + s.g + s.b;

// ---------- Category 1: conc (linear) vs metric ----------
const linearMetrics: Metric[] = [
  { id: "R", label: "R", category: "conc-linear", compute: (s) => s.r },
  { id: "G", label: "G", category: "conc-linear", compute: (s) => s.g },
  { id: "B", label: "B", category: "conc-linear", compute: (s) => s.b },
  { id: "mean", label: "(R+G+B)/3", category: "conc-linear", compute: (s) => sum(s) / 3 },
  { id: "luminance", label: "I = 0.299R + 0.587G + 0.112B", category: "conc-linear", compute: lum },
  // Reciprocals
  { id: "inv_R", label: "1/R", category: "conc-linear", compute: (s) => (s.r === 0 ? NaN : 1 / s.r) },
  { id: "inv_G", label: "1/G", category: "conc-linear", compute: (s) => (s.g === 0 ? NaN : 1 / s.g) },
  { id: "inv_B", label: "1/B", category: "conc-linear", compute: (s) => (s.b === 0 ? NaN : 1 / s.b) },
  // Pair ratios
  { id: "R_over_G", label: "R/G", category: "conc-linear", compute: (s) => (s.g === 0 ? NaN : s.r / s.g) },
  { id: "G_over_B", label: "G/B", category: "conc-linear", compute: (s) => (s.b === 0 ? NaN : s.g / s.b) },
  { id: "B_over_R", label: "B/R", category: "conc-linear", compute: (s) => (s.r === 0 ? NaN : s.b / s.r) },
  { id: "R_over_B", label: "R/B", category: "conc-linear", compute: (s) => (s.b === 0 ? NaN : s.r / s.b) },
  { id: "B_over_G", label: "B/G", category: "conc-linear", compute: (s) => (s.g === 0 ? NaN : s.b / s.g) },
  { id: "G_over_R", label: "G/R", category: "conc-linear", compute: (s) => (s.r === 0 ? NaN : s.g / s.r) },
  // Channel fractions of total
  { id: "R_frac", label: "R/(R+G+B)", category: "conc-linear", compute: (s) => (sum(s) === 0 ? NaN : s.r / sum(s)) },
  { id: "G_frac", label: "G/(R+G+B)", category: "conc-linear", compute: (s) => (sum(s) === 0 ? NaN : s.g / sum(s)) },
  { id: "B_frac", label: "B/(R+G+B)", category: "conc-linear", compute: (s) => (sum(s) === 0 ? NaN : s.b / sum(s)) },
  // Sum-to-channel ratios
  { id: "sum_over_R", label: "(R+G+B)/R", category: "conc-linear", compute: (s) => (s.r === 0 ? NaN : sum(s) / s.r) },
  { id: "sum_over_G", label: "(R+G+B)/G", category: "conc-linear", compute: (s) => (s.g === 0 ? NaN : sum(s) / s.g) },
  { id: "sum_over_B", label: "(R+G+B)/B", category: "conc-linear", compute: (s) => (s.b === 0 ? NaN : sum(s) / s.b) },
  // Channel / I (luminance)
  { id: "R_over_I", label: "R/I", category: "conc-linear", compute: (s) => { const I = lum(s); return I === 0 ? NaN : s.r / I; } },
  { id: "G_over_I", label: "G/I", category: "conc-linear", compute: (s) => { const I = lum(s); return I === 0 ? NaN : s.g / I; } },
  { id: "B_over_I", label: "B/I", category: "conc-linear", compute: (s) => { const I = lum(s); return I === 0 ? NaN : s.b / I; } },
  // I0-I (blank-dependent)
  { id: "I0-I", label: "I\u2080 \u2212 I", category: "conc-linear", needsBlank: true, compute: (s, b) => (b ? lum(b) - lum(s) : NaN) },
  // log10(I0/I) Beer-Lambert luminance
  { id: "beer_lambert", label: "log\u2081\u2080(I\u2080/I)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => { if (!b) return NaN; const I0 = lum(b), I = lum(s); return I0 <= 0 || I <= 0 ? NaN : Math.log10(I0 / I); } },
  // Per-channel absorbance log10(blank/sample)
  { id: "abs_R", label: "log\u2081\u2080(R\u2090\u2090/R)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b || s.r <= 0 || b.r <= 0 ? NaN : Math.log10(b.r / s.r)) },
  { id: "abs_G", label: "log\u2081\u2080(G\u2090\u2090/G)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b || s.g <= 0 || b.g <= 0 ? NaN : Math.log10(b.g / s.g)) },
  { id: "abs_B", label: "log\u2081\u2080(B\u2090\u2090/B)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b || s.b <= 0 || b.b <= 0 ? NaN : Math.log10(b.b / s.b)) },
  // Per-channel transmittance log10(sample/blank)
  { id: "trans_R", label: "log\u2081\u2080(R/R\u2090\u2090)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b || s.r <= 0 || b.r <= 0 ? NaN : Math.log10(s.r / b.r)) },
  { id: "trans_G", label: "log\u2081\u2080(G/G\u2090\u2090)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b || s.g <= 0 || b.g <= 0 ? NaN : Math.log10(s.g / b.g)) },
  { id: "trans_B", label: "log\u2081\u2080(B/B\u2090\u2090)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b || s.b <= 0 || b.b <= 0 ? NaN : Math.log10(s.b / b.b)) },
  // Euclidean color distance from blank
  { id: "euclidean", label: "\u221A(\u0394R\u00B2+\u0394G\u00B2+\u0394B\u00B2)", category: "conc-linear", needsBlank: true,
    compute: (s, b) => (!b ? NaN : Math.sqrt((s.r - b.r) ** 2 + (s.g - b.g) ** 2 + (s.b - b.b) ** 2)) },
];

// ---------- Category 2: log(conc) vs log(metric) ----------
// We reuse the metric compute and apply log10 to BOTH x (conc) and y (metric value) at fit-time.
const loglogMetrics: Metric[] = [
  { id: "ll_R", label: "log R vs log conc", category: "logconc-loglinear", compute: (s) => s.r },
  { id: "ll_G", label: "log G vs log conc", category: "logconc-loglinear", compute: (s) => s.g },
  { id: "ll_B", label: "log B vs log conc", category: "logconc-loglinear", compute: (s) => s.b },
  { id: "ll_inv_R", label: "log(1/R) vs log conc", category: "logconc-loglinear", compute: (s) => (s.r === 0 ? NaN : 1 / s.r) },
  { id: "ll_inv_G", label: "log(1/G) vs log conc", category: "logconc-loglinear", compute: (s) => (s.g === 0 ? NaN : 1 / s.g) },
  { id: "ll_inv_B", label: "log(1/B) vs log conc", category: "logconc-loglinear", compute: (s) => (s.b === 0 ? NaN : 1 / s.b) },
  { id: "ll_R_G", label: "log(R/G) vs log conc", category: "logconc-loglinear", compute: (s) => (s.g === 0 ? NaN : s.r / s.g) },
  { id: "ll_G_B", label: "log(G/B) vs log conc", category: "logconc-loglinear", compute: (s) => (s.b === 0 ? NaN : s.g / s.b) },
  { id: "ll_B_R", label: "log(B/R) vs log conc", category: "logconc-loglinear", compute: (s) => (s.r === 0 ? NaN : s.b / s.r) },
  { id: "ll_R_B", label: "log(R/B) vs log conc", category: "logconc-loglinear", compute: (s) => (s.b === 0 ? NaN : s.r / s.b) },
  { id: "ll_B_G", label: "log(B/G) vs log conc", category: "logconc-loglinear", compute: (s) => (s.g === 0 ? NaN : s.b / s.g) },
  { id: "ll_G_R", label: "log(G/R) vs log conc", category: "logconc-loglinear", compute: (s) => (s.r === 0 ? NaN : s.g / s.r) },
  { id: "ll_R_frac", label: "log(R/(R+G+B)) vs log conc", category: "logconc-loglinear", compute: (s) => (sum(s) === 0 ? NaN : s.r / sum(s)) },
  { id: "ll_G_frac", label: "log(G/(R+G+B)) vs log conc", category: "logconc-loglinear", compute: (s) => (sum(s) === 0 ? NaN : s.g / sum(s)) },
  { id: "ll_B_frac", label: "log(B/(R+G+B)) vs log conc", category: "logconc-loglinear", compute: (s) => (sum(s) === 0 ? NaN : s.b / sum(s)) },
  { id: "ll_sum_R", label: "log((R+G+B)/R) vs log conc", category: "logconc-loglinear", compute: (s) => (s.r === 0 ? NaN : sum(s) / s.r) },
  { id: "ll_sum_G", label: "log((R+G+B)/G) vs log conc", category: "logconc-loglinear", compute: (s) => (s.g === 0 ? NaN : sum(s) / s.g) },
  { id: "ll_sum_B", label: "log((R+G+B)/B) vs log conc", category: "logconc-loglinear", compute: (s) => (s.b === 0 ? NaN : sum(s) / s.b) },
];

export const METRICS: Metric[] = [...linearMetrics, ...loglogMetrics];

export function getMetricById(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}

export type FitResult = {
  slope: number;
  intercept: number;
  r2: number;
  se: number; // SE of regression residuals (in transformed y-units)
  lod: number; // 3 * sigma / |slope| (sigma uses blank-replicates if available, else SE)
  loq: number; // 10 * sigma / |slope|
  sigmaSource: "blank-replicates" | "regression-se";
  n: number;
  points: { x: number; y: number }[]; // values used for fitting (already transformed if log)
};

export function linearFit(
  xs: number[],
  ys: number[],
  sigmaBlank?: number
): FitResult | null {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) {
      pts.push({ x: xs[i], y: ys[i] });
    }
  }
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my;
    num += dx * dy; denX += dx * dx; denY += dy * dy;
  }
  if (denX === 0) return null;
  const slope = num / denX;
  const intercept = my - slope * mx;
  const r2 = denY === 0 ? 0 : (num * num) / (denX * denY);
  let ssRes = 0;
  for (const p of pts) {
    const yHat = slope * p.x + intercept;
    ssRes += (p.y - yHat) ** 2;
  }
  const se = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  // Use blank σ if provided (IUPAC standard for LoD)
  const sigma = sigmaBlank != null && Number.isFinite(sigmaBlank) ? sigmaBlank : se;
  const sigmaSource: FitResult["sigmaSource"] =
    sigmaBlank != null && Number.isFinite(sigmaBlank) ? "blank-replicates" : "regression-se";
  const absSlope = Math.abs(slope);
  const lod = absSlope > 0 ? (3 * sigma) / absSlope : NaN;
  const loq = absSlope > 0 ? (10 * sigma) / absSlope : NaN;
  return { slope, intercept, r2, se, lod, loq, sigmaSource, n, points: pts };
}

export type MetricFit = {
  metric: Metric;
  fit: FitResult | null;
  error?: string;
};

// Compute σ_blank for each metric across replicate blank samples.
export function blankSigmas(
  blanks: RGB[],
  blankAvg?: RGB
): Map<string, number> {
  const out = new Map<string, number>();
  if (blanks.length < 2) return out;
  for (const m of METRICS) {
    const vals: number[] = [];
    for (const b of blanks) {
      const v = m.compute(b, blankAvg);
      if (Number.isFinite(v)) vals.push(v);
    }
    if (vals.length < 2) continue;
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    let s = 0;
    for (const v of vals) s += (v - mean) ** 2;
    const sd = Math.sqrt(s / (vals.length - 1)); // sample stdev
    out.set(m.id, sd);
  }
  return out;
}

export function fitAllMetrics(
  samples: { concentration: number; rgb: RGB; excluded?: boolean }[],
  blank?: RGB,
  sigmaBlanks?: Map<string, number>
): MetricFit[] {
  const active = samples.filter((s) => !s.excluded);
  return METRICS.map((m) => {
    if (m.needsBlank && !blank) {
      return { metric: m, fit: null, error: "Needs blank (I\u2080)" };
    }
    if (active.length < 2) {
      return { metric: m, fit: null, error: "Need \u2265 2 active samples" };
    }
    let xs: number[];
    let ys: number[];
    if (m.category === "logconc-loglinear") {
      // Drop samples with conc <= 0 or metric <= 0 (log undefined)
      xs = []; ys = [];
      for (const s of active) {
        const yv = m.compute(s.rgb, blank);
        if (s.concentration > 0 && Number.isFinite(yv) && yv > 0) {
          xs.push(Math.log10(s.concentration));
          ys.push(Math.log10(yv));
        }
      }
    } else {
      xs = active.map((s) => s.concentration);
      ys = active.map((s) => m.compute(s.rgb, blank));
    }
    const sigmaBlank = sigmaBlanks?.get(m.id);
    const fit = linearFit(xs, ys, sigmaBlank);
    return { metric: m, fit, error: fit ? undefined : "Fit failed" };
  });
}

export function bestMetric(fits: MetricFit[]): MetricFit | null {
  let best: MetricFit | null = null;
  for (const f of fits) {
    if (!f.fit) continue;
    if (!best || !best.fit || f.fit.r2 > best.fit.r2) best = f;
  }
  return best;
}

export function predictConcentration(
  fit: FitResult,
  metric: Metric,
  rgb: RGB,
  blank?: RGB
): number {
  const yRaw = metric.compute(rgb, blank);
  if (!Number.isFinite(yRaw) || fit.slope === 0) return NaN;
  if (metric.category === "logconc-loglinear") {
    if (yRaw <= 0) return NaN;
    const logY = Math.log10(yRaw);
    const logX = (logY - fit.intercept) / fit.slope;
    return Math.pow(10, logX);
  }
  return (yRaw - fit.intercept) / fit.slope;
}

export function defaultEquationValue(rgb: RGB): number {
  const I = lum(rgb);
  if (I <= 0) return NaN;
  return Math.log10(255 / I);
}
export const DEFAULT_EQUATION_LABEL = "log\u2081\u2080(255 / I)";
