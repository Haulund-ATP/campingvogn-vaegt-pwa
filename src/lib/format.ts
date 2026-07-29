export function formatKg(value: number): string {
  return value.toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/** "for 5 minutter siden" — bruges til at vise, hvor gamle offline-tal er. */
export function formatSince(isoTimestamp: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(isoTimestamp).getTime()) / 60_000);
  if (minutes < 1) return "lige nu";
  if (minutes < 60) return `for ${minutes} min. siden`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `for ${hours} ${hours === 1 ? "time" : "timer"} siden`;

  const days = Math.round(hours / 24);
  return `for ${days} ${days === 1 ? "dag" : "dage"} siden`;
}
