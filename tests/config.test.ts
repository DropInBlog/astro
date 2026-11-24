import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveOptions } from '../src/lib/config.js';

const ENV_KEYS = ['DROPINBLOG_API_KEY', 'DROPINBLOG_API_TOKEN', 'DROPINBLOG_BLOG_ID'] as const;
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
    const opts = resolveOptions({ apiKey: 'k', blogId: 'b' });
    expect(opts.basePath).toBe('/blog');
    expect(opts.apiBaseUrl).toBe('https://api.dropinblog.com/v2');
    expect(opts.mode).toBe('auto');
    expect(opts.cacheTtlMs).toBe(5 * 60 * 1000);
    expect(opts.fields).toEqual(['head_data', 'body_html']);
    expect(opts.feedLimit).toBeUndefined();
    expect(opts.feedType).toBeUndefined();
    expect(opts.deprecations).toEqual([]);
  });

  it('falls back to env vars', () => {
    process.env.DROPINBLOG_API_KEY = 'env-key';
    process.env.DROPINBLOG_BLOG_ID = 'env-blog';
    const opts = resolveOptions({});
    expect(opts.apiKey).toBe('env-key');
    expect(opts.blogId).toBe('env-blog');
    expect(opts.deprecations).toEqual([]);
  });

  it('prefers explicit options over env vars', () => {
    process.env.DROPINBLOG_API_KEY = 'env-key';
    process.env.DROPINBLOG_BLOG_ID = 'env-blog';
    const opts = resolveOptions({ apiKey: 'explicit', blogId: 'explicit-blog' });
    expect(opts.apiKey).toBe('explicit');
    expect(opts.blogId).toBe('explicit-blog');
  });

  // astro.config.mjs runs before Astro copies .env into process.env, so the
  // README's zero-option setup depends on this.
  it('reads .env from the project root, with process.env taking priority', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'dib-env-'));
    writeFileSync(
      join(projectRoot, '.env'),
      'DROPINBLOG_API_KEY=dotenv-key\nDROPINBLOG_BLOG_ID=dotenv-blog\n',
    );
    const originalCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      delete process.env.DROPINBLOG_API_KEY;
      delete process.env.DROPINBLOG_API_TOKEN;
      delete process.env.DROPINBLOG_BLOG_ID;
      expect(resolveOptions({})).toMatchObject({ apiKey: 'dotenv-key', blogId: 'dotenv-blog' });

      process.env.DROPINBLOG_BLOG_ID = 'shell-blog';
      expect(resolveOptions({})).toMatchObject({ apiKey: 'dotenv-key', blogId: 'shell-blog' });
    } finally {
      process.chdir(originalCwd);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('throws when apiKey is missing', () => {
    delete process.env.DROPINBLOG_API_KEY;
    delete process.env.DROPINBLOG_API_TOKEN;
    delete process.env.DROPINBLOG_BLOG_ID;
    expect(() => resolveOptions({ blogId: 'b' })).toThrow(/apiKey/);
  });

  it('throws when blogId is missing', () => {
    delete process.env.DROPINBLOG_API_KEY;
    delete process.env.DROPINBLOG_BLOG_ID;
    expect(() => resolveOptions({ apiKey: 'k' })).toThrow(/blogId/);
  });

  it('normalizes the basePath', () => {
    const opts = resolveOptions({ apiKey: 'k', blogId: 'b', basePath: 'news/' });
    expect(opts.basePath).toBe('/news');
  });

  describe('legacy token names', () => {
    it('accepts the deprecated apiToken option and warns', () => {
      const opts = resolveOptions({ apiToken: 'legacy', blogId: 'b' });
      expect(opts.apiKey).toBe('legacy');
      expect(opts.deprecations).toEqual([
        'the "apiToken" option is deprecated — rename it to "apiKey".',
      ]);
    });

    it('accepts the deprecated env var and warns', () => {
      process.env.DROPINBLOG_API_TOKEN = 'env-legacy';
      process.env.DROPINBLOG_BLOG_ID = 'env-blog';
      const opts = resolveOptions({});
      expect(opts.apiKey).toBe('env-legacy');
      expect(opts.deprecations).toEqual([
        'DROPINBLOG_API_TOKEN is deprecated — rename it to DROPINBLOG_API_KEY.',
      ]);
    });

    it('prefers apiKey over apiToken without warning', () => {
      const opts = resolveOptions({ apiKey: 'new', apiToken: 'old', blogId: 'b' });
      expect(opts.apiKey).toBe('new');
      expect(opts.deprecations).toEqual([]);
    });

    it('prefers the new env var over the legacy one without warning', () => {
      process.env.DROPINBLOG_API_KEY = 'env-key';
      process.env.DROPINBLOG_API_TOKEN = 'env-legacy';
      process.env.DROPINBLOG_BLOG_ID = 'env-blog';
      const opts = resolveOptions({});
      expect(opts.apiKey).toBe('env-key');
      expect(opts.deprecations).toEqual([]);
    });

    it('falls through a blank new env var to the legacy one', () => {
      process.env.DROPINBLOG_API_KEY = '';
      process.env.DROPINBLOG_API_TOKEN = 'env-legacy';
      process.env.DROPINBLOG_BLOG_ID = 'env-blog';
      const opts = resolveOptions({});
      expect(opts.apiKey).toBe('env-legacy');
      expect(opts.deprecations).toEqual([
        'DROPINBLOG_API_TOKEN is deprecated — rename it to DROPINBLOG_API_KEY.',
      ]);
    });

    it('prefers the deprecated option over env vars', () => {
      process.env.DROPINBLOG_API_KEY = 'env-key';
      const opts = resolveOptions({ apiToken: 'legacy', blogId: 'b' });
      expect(opts.apiKey).toBe('legacy');
    });
  });
});
