// Colorimetric metrics, linear regression, R², SE, LoD.
// LoD multiplier = 3 per user preference.

export type RGB = { r: number; g: number; b: number };

export type Metric = {
  id: string;
  label: string;
  needsBlank?: boolean;
  compute: (s: RGB, blank?: RGB) => number;
};

const lum = (s: RGB) => 0.299 * s.r + 0.587 * s.g + 0.112 * s.b;

export const METRICS: Metric[] = [
  { id: "R", label: "R", compute: (s) => s.r },
  { id: "G", label: "G", compute: (s) => s.g },
  { id: "B", label: "B", compute: (s) => s.b },
  { id: "mean", label: "(R+G+B)/3", compute: (s) => (s.r + s.g + s.b) / 3 },
  { id: "luminance", label: "I = 0.299R + 0.587G + 0.112B", compute: lum },
  {
    id: "I0-I",
    label: "I\u2080 \u2212 I",
    needsBlank: true,
    compute: (s, b) => (b ? lum(b) - lum(s) : NaN),
  },
  {
    id: "sum_over_R",
    label: "(R+G+B)/R",
    compute: (s) => (s.r === 0 ? NaN : (s.r + s.g + s.b) / s.r),
  },
  {
    id: "sum_over_G",
    label: "(R+G+B)/G",
    compute: (s) => (s.g === 0 ? NaN : (s.r + s.g + s.b) / s.g),
  },
  {
    id: "sum_over_B",
    label: "(R+G+B)/B",
    compute: (s) => (s.b === 0 ? NaN : (s.r + s.g + s.b) / s.b),
  },
  { id: "R_over_G", label: "R/G", compute: (s) => (s.g === 0 ? NaN : s.r / s.g) },
  { id: "G_over_B", label: "G/B", compute: (s) => (s.b === 0 ? NaN : s.g / s.b) },
  { id: "B_over_R", label: "B/R", compute: (s) => (s.r === 0 ? NaN : s.b / s.r) },
  {
    id: "beer_lambert",
    label: "log\u2081\u2080(I\u2080/I)",
    needsBlank: true,
    compute: (s, b) => {
      if (!b) return NaN;
      const I0 = lum(b);
      const I = lum(s);
      if (I <= 0 || I0 <= 0) return NaN;
      return Math.log10(I0 / I);
    },
  },
  {
    id: "euclidean",
    label: "\u221A(\u0394R\u00B2+\u0394G\u00B2+\u0394B\u00B2)",
    needsBlank: true,
    compute: (s, b) =>
      !b
        ? NaN
        : Math.sqrt(
            (s.r - b.r) ** 2 + (s.g - b.g) ** 2 + (s.b - b.b) ** 2
          ),
  },
];

export function getMetricById(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}

export type FitResult = {
  slope: number;
  intercept: number;
  r2: number;
  se: number; // standard error of regression (y-residuals)
  lod: number; // 3 * SE / |slope| — concentration units
  loq: number; // 10 * SE / |slope|
  n: number;
  points: { x: number; y: number }[];
};

// Linear regression of y on x: y = slope*x + intercept
export function linearFit(xs: number[], ys: number[]): FitResult | null {
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
  let num = 0,
    denX = 0,
    denY = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0) return null;

  const slope = num / denX;
  const intercept = my - slope * mx;
  const r2 = denY === 0 ? 0 : (num * num) / (denX * denY);

  // SE of regression: sqrt( SS_res / (n-2) )
  let ssRes = 0;
  for (const p of pts) {
    const yHat = slope * p.x + intercept;
    ssRes += (p.y - yHat) ** 2;
  }
  const se = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  const absSlope = Math.abs(slope);
  const lod = absSlope > 0 ? (3 * se) / absSlope : NaN;
  const loq = absSlope > 0 ? (10 * se) / absSlope : NaN;

  return { slope, intercept, r2, se, lod, loq, n, points: pts };
}

export type MetricFit = {
  metric: Metric;
  fit: FitResult | null;
  error?: string;
};

export function fitAllMetrics(
  samples: { concentration: number; rgb: RGB; excluded?: boolean }[],
  blank?: RGB
): MetricFit[] {
  const active = samples.filter((s) => !s.excluded);
  return METRICS.map((m) => {
    if (m.needsBlank && !blank) {
      return { metric: m, fit: null, error: "Needs blank (I\u2080)" };
    }
    if (active.length < 2) {
      return { metric: m, fit: null, error: "Need \u2265 2 active samples" };
    }
    const xs = active.map((s) => s.concentration);
    const ys = active.map((s) => m.compute(s.rgb, blank));
    const fit = linearFit(xs, ys);
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

// Given fit + metric + new RGB, back-calculate concentration.
export function predictConcentration(
  fit: FitResult,
  metric: Metric,
  rgb: RGB,
  blank?: RGB
): number {
  const y = metric.compute(rgb, blank);
  if (!Number.isFinite(y) || fit.slope === 0) return NaN;
  return (y - fit.intercept) / fit.slope;
}

// Default fallback equation when no calibration exists: Beer-Lambert w/ I0=255.
// Returns an "effective" absorbance.
export function defaultEquationValue(rgb: RGB): number {
  const I = lum(rgb);
  if (I <= 0) return NaN;
  return Math.log10(255 / I);
}
export const DEFAULT_EQUATION_LABEL = "log\u2081\u2080(255 / I)";
