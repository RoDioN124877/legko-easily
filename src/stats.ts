export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  stddev: number;
}

/** Linear-interpolated percentile of an ascending-sorted array (p in 0..100). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (rank - lo);
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const count = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / count;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count;
  return {
    count,
    min: sorted[0]!,
    max: sorted[count - 1]!,
    mean,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    stddev: Math.sqrt(variance),
  };
}
