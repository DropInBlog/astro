import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOrFetch, readCache, writeCache } from '../src/lib/cache.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dib-cache-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cache', () => {
  it('round-trips data', async () => {
    await writeCache(dir, 'post-hello-2026', { body_html: '<p>hi</p>' });
    const result = await readCache<{ body_html: string }>(dir, 'post-hello-2026');
    expect(result).toEqual({ body_html: '<p>hi</p>' });
  });

  it('returns null on miss', async () => {
    expect(await readCache(dir, 'nope')).toBeNull();
  });

  it('expires entries past their TTL', async () => {
    await writeCache(dir, 'ttl-test', { value: 1 });
    expect(await readCache(dir, 'ttl-test', 60_000)).toEqual({ value: 1 });
    expect(await readCache(dir, 'ttl-test', -1)).toBeNull();
  });

  it('sanitizes unsafe key characters', async () => {
    await writeCache(dir, 'post/../../etc/passwd:2026-01-01T00:00:00Z', { safe: true });
    const result = await readCache(dir, 'post/../../etc/passwd:2026-01-01T00:00:00Z');
    expect(result).toEqual({ safe: true });
  });

  it('getOrFetch fetches on miss and serves cache on hit', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { n: calls };
    };
    const first = await getOrFetch(dir, 'gof', fetcher);
    const second = await getOrFetch(dir, 'gof', fetcher);
    expect(first).toEqual({ n: 1 });
    expect(second).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });
});
