import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytes, formatMs, formatSpeed, speedValue } from "./format.js";
import { buildReport } from "./report.js";
import { percentile, summarize } from "./stats.js";

test("summarize computes mean, median, p95, stddev", () => {
  const s = summarize([1, 2, 3, 4, 5])!;
  assert.equal(s.mean, 3);
  assert.equal(s.median, 3);
  assert.equal(s.min, 1);
  assert.equal(s.max, 5);
  assert.ok(Math.abs(s.stddev - Math.sqrt(2)) < 1e-9);
  assert.ok(Math.abs(s.p95 - 4.8) < 1e-9);
});

test("summarize of empty input is null; percentile interpolates", () => {
  assert.equal(summarize([]), null);
  assert.equal(percentile([10, 20], 50), 15);
});

test("formatBytes uses decimal units", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1_500_000), "1.50 MB");
});

test("formatMs switches to seconds", () => {
  assert.equal(formatMs(250), "250 ms");
  assert.equal(formatMs(1234), "1.234 s");
});

test("speed conversion: 1 MB/s == 8 Mbit/s", () => {
  assert.equal(speedValue(1_000_000, "mbit"), 8);
  assert.equal(speedValue(1_000_000, "mbyte"), 1);
  assert.equal(formatSpeed(12_500_000, "mbit"), "100.00 Mbit/s");
});

test("report aggregates bytes / total time (not mean of speeds)", () => {
  const r = buildReport(
    "http://x",
    2,
    [
      { status: 200, bytes: 1_000_000, ttfbMs: 10, totalMs: 1000 },
      { status: 200, bytes: 1_000_000, ttfbMs: 10, totalMs: 3000 },
    ],
    [],
  );
  assert.equal(r.totalBytes, 2_000_000);
  assert.equal(r.avgTimeMs, 2000);
  assert.equal(r.speedBytesPerSec, 500_000);
});
