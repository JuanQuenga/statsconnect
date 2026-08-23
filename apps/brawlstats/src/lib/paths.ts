export function appPath(path: string): string {
  if (!path.startsWith("/")) return path;
  const baseUrl = import.meta.env?.BASE_URL ?? "/";
  return `${baseUrl}${path.replace(/^\/+/, "")}`;
}
