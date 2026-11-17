export type SpeedUnit = "mbit" | "mbyte";

export const SPEED_UNITS: readonly SpeedUnit[] = ["mbit", "mbyte"];

/** Decimal (SI) units: 1 MB = 1 000 000 bytes. */
export function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return i === 0 ? `${value} B` : `${value.toFixed(2)} ${units[i]}`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(3)} s`;
}

export function speedValue(bytesPerSec: number, unit: SpeedUnit): number {
  return unit === "mbit" ? (bytesPerSec * 8) / 1e6 : bytesPerSec / 1e6;
}

export function speedLabel(unit: SpeedUnit): string {
  return unit === "mbit" ? "Mbit/s" : "MB/s";
}

export function formatSpeed(bytesPerSec: number, unit: SpeedUnit): string {
  return `${speedValue(bytesPerSec, unit).toFixed(2)} ${speedLabel(unit)}`;
}

export function createPaint(enabled: boolean) {
  const wrap = (open: number, close: number) => (s: string) =>
    enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    cyan: wrap(36, 39),
    yellow: wrap(33, 39),
  };
}

export type Paint = ReturnType<typeof createPaint>;
