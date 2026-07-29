export type HashRoute =
  | { action: "admin"; token: string }
  | { action: "add" | "remove"; trip: string; token: string }
  | { action: null };

export function parseHashRoute(hash: string): HashRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const action = params.get("action");

  if (action === "admin") {
    const token = params.get("token");
    if (token) return { action: "admin", token };
  }

  if (action === "add" || action === "remove") {
    const trip = params.get("trip");
    const token = params.get("token");
    if (trip && token) return { action, trip, token };
  }

  return { action: null };
}

export function clearHash(): void {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}
