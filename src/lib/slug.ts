export function normalizeBasePath(input: string): string {
  let path = (input ?? '').trim();
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (path === '') {
    return '/blog';
  }
  return '/' + path;
}
