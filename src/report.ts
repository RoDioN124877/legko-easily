import { type Paint, type SpeedUnit, formatBytes, formatMs, formatSpeed, speedLabel, speedValue } from "./format.js";
import type { Sample } from "./measure.js";
import { type Summary, summarize } from "./stats.js";

export interface Failure {
  index: number;
  error: string;
}

export interface Report {
  url: string;
  requested: number;
  succeeded: number;
  failures: Failure[];
  samples: Sample[];
  totalBytes: number;
  totalTimeMs: number;
  avgTimeMs: number | null;
  /** Aggregate: total bytes / total time. Bytes per second. */
  speedBytesPerSec: number | null;
  timeMs: Summary | null;
  /** Per-request speeds, bytes per second. */
  perRequestSpeed: Summary | null;
}

export const sampleSpeed = (s: Sample): number => (s.bytes / s.totalMs) * 1000;

export function buildReport(url: string, requested: number, samples: Sample[], failures: Failure[]): Report {
  const totalBytes = samples.reduce((s, x) => s + x.bytes, 0);
  const totalTimeMs = samples.reduce((s, x) => s + x.totalMs, 0);
  const ok = samples.length > 0 && totalTimeMs > 0;
  return {
    url,
    requested,
    succeeded: samples.length,
    failures,
    samples,
    totalBytes,
    totalTimeMs,
    avgTimeMs: samples.length ? totalTimeMs / samples.length : null,
    speedBytesPerSec: ok ? (totalBytes / totalTimeMs) * 1000 : null,
    timeMs: summarize(samples.map((s) => s.totalMs)),
    perRequestSpeed: summarize(samples.map(sampleSpeed)),
  };
}

export function toJson(r: Report, unit: SpeedUnit) {
  const bps = r.speedBytesPerSec;
  return {
    url: r.url,
    requests: { requested: r.requested, succeeded: r.succeeded, failed: r.failures },
    averageTimeMs: r.avgTimeMs,
    totalBytes: r.totalBytes,
    speed: bps === null ? null : { unit: speedLabel(unit), value: speedValue(bps, unit), bytesPerSecond: bps },
    timeMs: r.timeMs,
    samples: r.samples,
  };
}

const BAR_WIDTH = 16;

function bar(value: number, max: number, paint: Paint): string {
  const filled = max > 0 ? Math.max(1, Math.round((value / max) * BAR_WIDTH)) : 0;
  return paint.cyan("█".repeat(filled)) + paint.dim("░".repeat(BAR_WIDTH - filled));
}

const pad = (s: string, w: number) => s.padStart(w);

export function renderText(r: Report, unit: SpeedUnit, paint: Paint): string {
  const label = speedLabel(unit);
  const lines: string[] = [];
  const speeds = r.samples.map(sampleSpeed);
  const maxSpeed = Math.max(0, ...speeds);

  lines.push("");
  lines.push(
    paint.dim(`  ${pad("#", 2)}  ${pad("size", 9)}  ${pad("TTFB", 8)}  ${pad("time", 9)}  ${pad(label, 11)}`),
  );

  // Rows in request order, including failures.
  const failByIndex = new Map(r.failures.map((f) => [f.index, f.error]));
  let si = 0;
  for (let i = 1; i <= r.requested; i++) {
    const err = failByIndex.get(i);
    if (err !== undefined) {
      lines.push(`  ${pad(String(i), 2)}  ${paint.red(`✗ ${err}`)}`);
      continue;
    }
    const s = r.samples[si];
    const sp = speeds[si];
    si++;
    if (!s || sp === undefined) continue; // aborted before this request ran
    lines.push(
      `  ${pad(String(i), 2)}  ${pad(formatBytes(s.bytes), 9)}  ${pad(formatMs(s.ttfbMs), 8)}  ${pad(formatMs(s.totalMs), 9)}  ` +
        `${pad(speedValue(sp, unit).toFixed(2), 11)}  ${bar(sp, maxSpeed, paint)}`,
    );
  }

  const row = (k: string, v: string) => `  ${paint.dim(k.padEnd(24))}${v}`;
  lines.push("");
  lines.push(paint.bold("  Summary"));
  const okText = `${r.succeeded} / ${r.requested}`;
  lines.push(row("Successful requests", r.failures.length ? paint.yellow(okText) : paint.green(okText)));
  if (r.succeeded === 0) return lines.join("\n");

  lines.push(row("Average request time", formatMs(r.avgTimeMs!)));
  if (r.timeMs && r.succeeded > 1) {
    lines.push(
      row(
        "  min / median / max",
        `${formatMs(r.timeMs.min)} / ${formatMs(r.timeMs.median)} / ${formatMs(r.timeMs.max)}`,
      ),
    );
    lines.push(row("  std deviation", `± ${formatMs(r.timeMs.stddev)}`));
  }
  lines.push(row("Total downloaded", `${formatBytes(r.totalBytes)} (${r.totalBytes} bytes)`));
  lines.push(row("Download speed", paint.bold(paint.green(formatSpeed(r.speedBytesPerSec!, unit)))));
  return lines.join("\n");
}
