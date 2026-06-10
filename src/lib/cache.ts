// Disk cache under Astro's cacheDir. node:fs is imported lazily inside each
// function so this module can be loaded on serverless/worker runtimes (where
// node builtins may be unavailable) as long as the cache is never exercised
// there — SSR-mode code paths skip the cache entirely.

const CACHE_NAMESPACE = '@dropinblog-astro';

interface CacheEnvelope<T> {
  data: T;
  writtenAt: number;
}

// Readable prefix plus a hash of the raw key so distinct keys can never
// collide after character replacement or truncation.
function sanitize(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  }
  const readable = key.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 180);
  return `${readable}-${hash.toString(16)}`;
}

async function cacheFile(cacheDir: string, key: string): Promise<string> {
  const { join } = await import('node:path');
  return join(cacheDir, CACHE_NAMESPACE, `${sanitize(key)}.json`);
}

export async function readCache<T>(cacheDir: string, key: string, ttlMs?: number): Promise<T | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const file = await cacheFile(cacheDir, key);
    const envelope = JSON.parse(await readFile(file, 'utf8')) as CacheEnvelope<T>;
    if (ttlMs !== undefined && Date.now() - envelope.writtenAt > ttlMs) {
      return null;
    }
    return envelope.data;
  } catch {
    return null;
  }
}

export async function writeCache<T>(cacheDir: string, key: string, data: T): Promise<void> {
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const file = await cacheFile(cacheDir, key);
    await mkdir(dirname(file), { recursive: true });
    const envelope: CacheEnvelope<T> = { data, writtenAt: Date.now() };
    await writeFile(file, JSON.stringify(envelope), 'utf8');
  } catch {
    // A failed cache write must never fail a build or request.
  }
}

export async function getOrFetch<T>(
  cacheDir: string,
  key: string,
  fetcher: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  const cached = await readCache<T>(cacheDir, key, ttlMs);
  if (cached !== null) {
    return cached;
  }
  const data = await fetcher();
  await writeCache(cacheDir, key, data);
  return data;
}
