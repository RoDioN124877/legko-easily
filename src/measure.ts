export interface Sample {
  status: number;
  bytes: number;
  /** Time until response headers arrived, ms. */
  ttfbMs: number;
  /** Time until the body was fully downloaded, ms. */
  totalMs: number;
}

export interface MeasureOptions {
  timeoutMs: number;
  /** External cancellation (e.g. Ctrl+C). */
  signal?: AbortSignal;
  onProgress?: (bytesSoFar: number) => void;
}

export class RequestError extends Error {
  override name = "RequestError";
}

/**
 * Performs one GET and waits until the whole body is downloaded.
 * Compression is disabled so the byte count equals what travelled over the wire.
 */
export async function measure(url: URL, opts: MeasureOptions): Promise<Sample> {
  const signals = [AbortSignal.timeout(opts.timeoutMs)];
  if (opts.signal) signals.push(opts.signal);
  const signal = AbortSignal.any(signals);

  const start = performance.now();
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        "accept-encoding": "identity",
        "cache-control": "no-cache",
        "user-agent": "speedtest-cli/1.0",
      },
    });
    const ttfbMs = performance.now() - start;

    if (!res.ok) {
      await res.body?.cancel();
      throw new RequestError(`HTTP ${res.status} ${res.statusText}`.trim());
    }

    let bytes = 0;
    if (res.body) {
      for await (const chunk of res.body) {
        bytes += chunk.byteLength;
        opts.onProgress?.(bytes);
      }
    }
    return { status: res.status, bytes, ttfbMs, totalMs: performance.now() - start };
  } catch (err) {
    if (err instanceof RequestError) throw err;
    if (opts.signal?.aborted) throw new RequestError("interrupted");
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new RequestError(`timeout after ${opts.timeoutMs} ms`);
    }
    const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
    throw new RequestError(`${err instanceof Error ? err.message : String(err)}${cause}`);
  }
}
