export function getTone(weight: number): "low" | "mid" | "high" {
  if (weight >= 0.3) return "high";
  if (weight >= 0.2) return "mid";
  return "low";
}
