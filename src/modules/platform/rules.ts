/** Valores administrativos chegam como texto e nunca são confiados. */

export function parseMoneyToCents(input: unknown): number | null {
  const raw = String(input ?? "").trim();
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(raw)) return null;
  const normalized = raw.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function parsePercent(input: unknown): number | null {
  const value = Number(String(input ?? "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
}

export function parsePositiveInt(input: unknown, max = 1_000_000): number | null {
  const raw = String(input ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) return null;
  return value;
}

export function parseLimit(input: unknown): number | null {
  const raw = String(input ?? "").trim();
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) return null;
  return value;
}

export function parseIsoDate(input: unknown): Date | null {
  const raw = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isNonEmpty(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}
