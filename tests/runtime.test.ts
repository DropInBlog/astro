import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  authorPageStaticPaths,
  categoryPageStaticPaths,
  categoryStaticPaths,
  indexCacheKey,
  listStaticPaths,
  postStaticPaths,
} from '../src/lib/runtime.js';
import type { VirtualConfig } from '../src/lib/types.js';

let baseCacheDir: string;
let blogCounter = 0;

beforeAll(async () => {
  baseCacheDir = await mkdtemp(join(tmpdir(), 'dib-runtime-'));
});

afterAll(async () => {
  await rm(baseCacheDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Unique blogId per call defeats the per-blog index memo between tests, and
// a per-blog cacheDir keeps walk fetches from leaking between tests through
// the disk cache.
function makeConfig(mode: 'ssg' | 'ssr' = 'ssg'): VirtualConfig {
  blogCounter += 1;
  return {
    apiToken: 'token',
    blogId: `blog-${blogCounter}`,
    basePath: '/blog',
    apiBaseUrl: 'https://api.example.com/v2',
    mode,
    cacheTtlMs: 300_000,
    fields: ['head_data', 'body_html'],
    cacheDir: join(baseCacheDir, `blog-${blogCounter}`),
    feedLimit: undefined,
    feedType: undefined,
  };
}

// 25 published posts: all by author jane, all in category news, the first 12
// also in category tips. Status/visibility intentionally UPPERCASE to verify
// case-insensitive filtering. One draft that must be excluded.
function makePosts() {
  const posts = Array.from({ length: 25 }, (_, i) => ({
    slug: `post-${i + 1}`,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    updatedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    categories: i < 12 ? [{ slug: 'news' }, { slug: 'tips' }] : [{ slug: 'news' }],
    author: { slug: 'jane' },
  }));
  posts.push({
    slug: 'draft-post',
    status: 'DRAFT',
    visibility: 'PUBLIC',
    updatedAt: '2026-02-01T00:00:00Z',
    categories: [{ slug: 'news' }],
    author: { slug: 'jane' },
  });
  return posts;
}

// Derived bounds with these posts at per_page=10: list 3 pages (26 rows incl.
// draft), news 3, tips 2, jane 3. `actual` overrides simulate the rendered
// endpoints having FEWER pages than derived (hero post, hidden categories).
interface StubOptions {
  actualListPages?: number;
  actualCategoryPages?: Record<string, number>;
  actualAuthorPages?: Record<string, number>;
}

function stubApi(options: StubOptions = {}) {
  const posts = makePosts();
  const perPage = 10; // the blog's posts_per_page setting
  const actualList = options.actualListPages ?? Number.POSITIVE_INFINITY;
  const actualCategories = options.actualCategoryPages ?? {};
  const actualAuthors = options.actualAuthorPages ?? {};

  const ok = (data: unknown) => {
    const body = { success: true, code: 0, message: 'OK', data };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const notFound = () => {
    const body = { success: false, code: 1009, message: 'Page out of range', data: null };
    return { ok: false, status: 404, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const rendered = (label: string) => ok({ body_html: `<div>${label}</div>`, head_data: { title: label } });

  const fn = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const page = Number(url.searchParams.get('page') ?? '1');

    if (url.pathname.endsWith('/posts')) {
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : perPage;
      const slice = posts.slice((page - 1) * limit, page * limit);
      return ok({
        posts: slice,
        pagination: {
          total: posts.length,
          per_page: limit,
          current_page: page,
          last_page: Math.max(1, Math.ceil(posts.length / limit)),
          previous_page_url: null,
          next_page_url: null,
        },
      });
    }

    let m;
    if ((m = url.pathname.match(/\/rendered\/list\/category\/([^/]+)$/))) {
      const slug = decodeURIComponent(m[1]!);
      const max = actualCategories[slug] ?? Number.POSITIVE_INFINITY;
      return page <= max ? rendered(`category ${slug} page ${page}`) : notFound();
    }
    if ((m = url.pathname.match(/\/rendered\/list\/author\/([^/]+)$/))) {
      const slug = decodeURIComponent(m[1]!);
      const max = actualAuthors[slug] ?? Number.POSITIVE_INFINITY;
      return page <= max ? rendered(`author ${slug} page ${page}`) : notFound();
    }
    if (url.pathname.endsWith('/rendered/list')) {
      return page <= actualList ? rendered(`list page ${page}`) : notFound();
    }
    throw new Error(`unexpected URL ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('static path derivation', () => {
  it('enumerates published posts and skips drafts (case-insensitive)', async () => {
    stubApi();
    const paths = await postStaticPaths(makeConfig());
    expect(paths).toHaveLength(25);
    expect(paths[0]).toEqual({
      params: { slug: 'post-1' },
      props: { cacheKey: '2026-01-01T00:00:00Z' },
    });
    expect(paths.some((p) => p.params.slug === 'draft-post')).toBe(false);
  });

  it('derives list pagination from the probe when rendered pages agree', async () => {
    stubApi({ actualListPages: 3 });
    const paths = await listStaticPaths(makeConfig());
    // Page 1 is the bare /blog route; pages 2..3 get static paths.
    expect(paths.map((p) => p.params.page)).toEqual(['2', '3']);
  });

  it('stops at the rendered last page when it is lower than the derived bound', async () => {
    // Hero posts / hidden categories make the rendered list shorter than
    // /posts implies. Prerendering past it would 404 and fail the build.
    stubApi({ actualListPages: 2 });
    const paths = await listStaticPaths(makeConfig());
    expect(paths.map((p) => p.params.page)).toEqual(['2']);
  });

  it('derives per-category pagination, verifying against rendered pages', async () => {
    stubApi({ actualCategoryPages: { news: 3, tips: 2 } });
    const config = makeConfig();
    const categories = await categoryStaticPaths(config);
    expect(categories.map((c) => c.params.slug).sort()).toEqual(['news', 'tips']);

    const pages = await categoryPageStaticPaths(config);
    // news: 25 posts -> 3 pages (2,3 prerendered); tips: 12 posts -> 2 pages (2)
    const news = pages.filter((p) => p.params.slug === 'news').map((p) => p.params.page);
    const tips = pages.filter((p) => p.params.slug === 'tips').map((p) => p.params.page);
    expect(news).toEqual(['2', '3']);
    expect(tips).toEqual(['2']);
  });

  it('trims category pagination when the rendered category is shorter', async () => {
    stubApi({ actualCategoryPages: { news: 1, tips: 2 } });
    const pages = await categoryPageStaticPaths(makeConfig());
    const news = pages.filter((p) => p.params.slug === 'news');
    const tips = pages.filter((p) => p.params.slug === 'tips').map((p) => p.params.page);
    expect(news).toEqual([]);
    expect(tips).toEqual(['2']);
  });

  it('derives author pagination from post counts', async () => {
    stubApi({ actualAuthorPages: { jane: 3 } });
    const pages = await authorPageStaticPaths(makeConfig());
    // jane: 25 posts -> 3 pages
    expect(pages.map((p) => p.params.page)).toEqual(['2', '3']);
  });

  it('builds the /posts index once per blog within a build', async () => {
    const fn = stubApi({ actualListPages: 3, actualCategoryPages: { news: 3, tips: 2 } });
    const config = makeConfig();
    await postStaticPaths(config);
    const postsCalls = () => fn.mock.calls.filter((c) => String(c[0]).includes('/posts')).length;
    const after = postsCalls();
    await listStaticPaths(config);
    await categoryPageStaticPaths(config);
    expect(postsCalls()).toBe(after);
  });

  it('passes explicit filters to /posts', async () => {
    const fn = stubApi();
    await postStaticPaths(makeConfig());
    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).toContain('statuses=published');
    expect(url).toContain('visibilities=public');
  });

  it('indexCacheKey returns a signature in ssg and undefined in ssr', async () => {
    stubApi();
    expect(await indexCacheKey(makeConfig('ssg'))).toMatch(/^[0-9a-f]+$/);
    expect(await indexCacheKey(makeConfig('ssr'))).toBeUndefined();
  });

  it('degrades to no paths in dev when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }));
    // vitest runs with import.meta.env.DEV = true, exercising the dev-server
    // fallback; production builds throw instead.
    const paths = await postStaticPaths(makeConfig());
    expect(paths).toEqual([]);
  });
});
