export type UnitOfMeasure = "piece" | "kg" | "litre" | "box";

export function parseQuantityInput(
  raw: string,
  unit: UnitOfMeasure,
): number | null {
  const value = raw.trim();
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  if (unit === "kg" || unit === "litre") {
    return Number(parsed.toFixed(3));
  }

  return Math.floor(parsed);
}
