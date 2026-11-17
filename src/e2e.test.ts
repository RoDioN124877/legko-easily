import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { RequestError, measure } from "./measure.js";

const run = promisify(execFile);
const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));
const BODY = Buffer.alloc(256 * 1024, 7);

let server: Server;
let base: string;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-length": BODY.length });
      res.end(BODY);
    } else if (req.url === "/hang") {
      // never respond
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

test("measure downloads the full body", async () => {
  const s = await measure(new URL(`${base}/ok`), { timeoutMs: 5000 });
  assert.equal(s.bytes, BODY.length);
  assert.ok(s.totalMs >= s.ttfbMs && s.ttfbMs >= 0);
});

test("measure rejects non-2xx", async () => {
  await assert.rejects(measure(new URL(`${base}/missing`), { timeoutMs: 5000 }), /HTTP 404/);
});

test("measure times out", async () => {
  await assert.rejects(measure(new URL(`${base}/hang`), { timeoutMs: 200 }), (e) => {
    assert.ok(e instanceof RequestError);
    assert.match(e.message, /timeout/);
    return true;
  });
});

test("cli --json: 10 requests by default, correct totals", async () => {
  const { stdout } = await run(process.execPath, [CLI, `${base}/ok`, "--json"]);
  const out = JSON.parse(stdout);
  assert.equal(out.requests.succeeded, 10);
  assert.equal(out.totalBytes, BODY.length * 10);
  assert.equal(out.speed.unit, "Mbit/s");
  assert.ok(out.speed.value > 0);
});

test("cli exits with 1 when every request fails", async () => {
  await assert.rejects(run(process.execPath, [CLI, `${base}/missing`, "-n", "2"]), (e: { code?: number }) => e.code === 1);
});

test("cli exits with 2 on bad usage", async () => {
  await assert.rejects(run(process.execPath, [CLI, "not-a-url"]), (e: { code?: number }) => e.code === 2);
});
