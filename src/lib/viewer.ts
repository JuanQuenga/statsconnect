const VIEWER_KEY = "statsconnect:viewer-id";

export function getViewerId(): string {
  const existing = window.localStorage.getItem(VIEWER_KEY);
  if (existing) return existing;
  const viewerId = crypto.randomUUID();
  window.localStorage.setItem(VIEWER_KEY, viewerId);
  return viewerId;
}
