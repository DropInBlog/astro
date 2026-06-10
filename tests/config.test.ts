import { afterEach, describe, expect, it } from 'vitest';
import { resolveOptions } from '../src/lib/config.js';

const ENV_KEYS = ['DROPINBLOG_API_TOKEN', 'DROPINBLOG_BLOG_ID'] as const;
const saved: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  saved[key] = process.env[key];
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('resolveOptions', () => {
  it('applies defaults', () => {
    const opts = resolveOptions({ apiToken: 't', blogId: 'b' });
    expect(opts.basePath).toBe('/blog');
    expect(opts.apiBaseUrl).toBe('https://api.dropinblog.com/v2');
    expect(opts.mode).toBe('auto');
    expect(opts.cacheTtlMs).toBe(5 * 60 * 1000);
    expect(opts.fields).toEqual(['head_data', 'body_html']);
    expect(opts.feedLimit).toBeUndefined();
    expect(opts.feedType).toBeUndefined();
  });

  it('falls back to env vars', () => {
    process.env.DROPINBLOG_API_TOKEN = 'env-token';
    process.env.DROPINBLOG_BLOG_ID = 'env-blog';
    const opts = resolveOptions({});
    expect(opts.apiToken).toBe('env-token');
    expect(opts.blogId).toBe('env-blog');
  });

  it('prefers explicit options over env vars', () => {
    process.env.DROPINBLOG_API_TOKEN = 'env-token';
    process.env.DROPINBLOG_BLOG_ID = 'env-blog';
    const opts = resolveOptions({ apiToken: 'explicit', blogId: 'explicit-blog' });
    expect(opts.apiToken).toBe('explicit');
    expect(opts.blogId).toBe('explicit-blog');
  });

  it('throws when apiToken is missing', () => {
    delete process.env.DROPINBLOG_API_TOKEN;
    delete process.env.DROPINBLOG_BLOG_ID;
    expect(() => resolveOptions({ blogId: 'b' })).toThrow(/apiToken/);
  });

  it('throws when blogId is missing', () => {
    delete process.env.DROPINBLOG_API_TOKEN;
    delete process.env.DROPINBLOG_BLOG_ID;
    expect(() => resolveOptions({ apiToken: 't' })).toThrow(/blogId/);
  });

  it('normalizes the basePath', () => {
    const opts = resolveOptions({ apiToken: 't', blogId: 'b', basePath: 'news/' });
    expect(opts.basePath).toBe('/news');
  });
});
