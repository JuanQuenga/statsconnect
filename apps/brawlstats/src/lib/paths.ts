export function appPath(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
