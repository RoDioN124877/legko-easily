#!/usr/bin/env node
import { parseArgs } from "node:util";
import { SPEED_UNITS, type SpeedUnit, createPaint, formatBytes } from "./format.js";
import { measure } from "./measure.js";
import type { Sample } from "./measure.js";
import { type Failure, buildReport, renderText, toJson } from "./report.js";

const HELP = `Usage: speedtest <url> [options]

Makes N sequential GET requests to <url>, waiting for each full response,
then prints average request time, total downloaded data and download speed.

Options:
  -n, --requests <n>   number of requests            (default: 10)
  -t, --timeout <sec>  per-request timeout, seconds  (default: 30)
  -u, --unit <unit>    mbit (Mbit/s) | mbyte (MB/s)  (default: mbit)
      --json           machine-readable JSON output
      --no-color       disable colors (also respects NO_COLOR)
  -h, --help           show this help

Exit codes: 0 ok, 1 all requests failed, 2 invalid usage, 130 interrupted.`;

class UsageError extends Error {}

function parseInput(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      requests: { type: "string", short: "n", default: "10" },
      timeout: { type: "string", short: "t", default: "30" },
      unit: { type: "string", short: "u", default: "mbit" },
      json: { type: "boolean", default: false },
      "no-color": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) return { help: true as const };
  if (positionals.length !== 1) throw new UsageError("expected exactly one <url> argument");

  let url: URL;
  try {
    url = new URL(positionals[0]!);
  } catch {
    throw new UsageError(`invalid URL: ${positionals[0]}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError("only http:// and https:// URLs are supported");
  }

  const requests = Number(values.requests);
  if (!Number.isInteger(requests) || requests < 1 || requests > 1000) {
    throw new UsageError("--requests must be an integer from 1 to 1000");
  }
  const timeoutSec = Number(values.timeout);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new UsageError("--timeout must be a positive number of seconds");
  }
  if (!SPEED_UNITS.includes(values.unit as SpeedUnit)) {
    throw new UsageError(`--unit must be one of: ${SPEED_UNITS.join(", ")}`);
  }

  return {
    help: false as const,
    url,
    requests,
    timeoutMs: timeoutSec * 1000,
    unit: values.unit as SpeedUnit,
    json: values.json,
    color: !values["no-color"] && !process.env["NO_COLOR"] && process.stdout.isTTY === true,
  };
}

async function main(): Promise<number> {
  let input;
  try {
    input = parseInput(process.argv.slice(2));
  } catch (err) {
    console.error(`speedtest: ${(err as Error).message}\n\n${HELP}`);
    return 2;
  }
  if (input.help) {
    console.log(HELP);
    return 0;
  }

  const { url, requests, timeoutMs, unit, json } = input;
  const paint = createPaint(input.color);
  const live = !json && process.stderr.isTTY === true;

  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());

  if (!json) console.log(`${paint.bold("speedtest")} ${paint.dim("→")} ${url.href}\n  ${requests} sequential requests, timeout ${timeoutMs / 1000}s`);

  const samples: Sample[] = [];
  const failures: Failure[] = [];

  for (let i = 1; i <= requests && !abort.signal.aborted; i++) {
    const progress = (bytes: number) => {
      if (live) process.stderr.write(`\r\x1b[2K  request ${i}/${requests} … ${formatBytes(bytes)}`);
    };
    progress(0);
    try {
      samples.push(await measure(url, { timeoutMs, signal: abort.signal, onProgress: progress }));
    } catch (err) {
      if (abort.signal.aborted) break;
      failures.push({ index: i, error: (err as Error).message });
    }
  }
  if (live) process.stderr.write("\r\x1b[2K");

  const report = buildReport(url.href, requests, samples, failures);
  if (json) console.log(JSON.stringify(toJson(report, unit), null, 2));
  else console.log(renderText(report, unit, paint));

  if (abort.signal.aborted) {
    if (!json) console.error(paint.yellow("\n  interrupted — partial results above"));
    return 130;
  }
  return report.succeeded === 0 ? 1 : 0;
}

process.exitCode = await main();
