import { getOrFetch } from './cache.js';
import { isNotFound, RenderedApiClient } from './client.js';
import type { IndexEntry, IndexResponse, RenderedResponse, VirtualConfig } from './types.js';

export { DropInBlogApiError, isNotFound } from './client.js';

const isDevServer = (): boolean => {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};

interface PostPath {
  params: { slug: string };
  props: { cacheKey: string; noindex?: boolean };
}

interface PagePath {
  params: { page: string };
  props: { cacheKey: string };
}

interface SlugPagePath {
  params: { slug: string; page: string };
  props: { cacheKey: string };
}

const FALLBACK_KEY = 'ttl';

function postKey(slug: string, cacheKey: string): string {
  return `post-${slug}-${cacheKey}`;
}

function listKey(page: number, cacheKey: string): string {
  return `list-${page}-${cacheKey}`;
}

function categoryKey(slug: string, page: number, cacheKey: string): string {
  return `category-${slug}-${page}-${cacheKey}`;
}

function authorKey(slug: string, page: number, cacheKey: string): string {
  return `author-${slug}-${page}-${cacheKey}`;
}

// Every route's getStaticPaths needs the index, so without memoization a
// single build would re-paginate /posts once per injected route. The short
// TTL keeps the dev server from holding a stale index forever. Keyed per
// blog so tests (and any multi-instance setup) stay isolated.
const indexMemos = new Map<string, { at: number; promise: Promise<IndexResponse | null> }>();
const INDEX_MEMO_TTL_MS = 60_000;

function maybeIndex(config: VirtualConfig): Promise<IndexResponse | null> {
  const key = `${config.apiBaseUrl}|${config.blogId}`;
  const memo = indexMemos.get(key);
  if (memo && Date.now() - memo.at < INDEX_MEMO_TTL_MS) {
    return memo.promise;
  }
  const promise = buildIndex(createClient(config));
  indexMemos.set(key, { at: Date.now(), promise });
  return promise;
}

// Hard cap to avoid runaway pagination if the API misreports last_page.
// At WALK_LIMIT posts per request this covers 20,000 posts.
const MAX_WALK_PAGES = 200;
const WALK_LIMIT = 100;

// API documentation shows uppercase values (PUBLISHED/PUBLIC); compare
// case-insensitively so a serializer change can never blank the blog.
function isPublishedVisible(p: { status?: string; visibility?: string }): boolean {
  if (p.status && p.status.toLowerCase() !== 'published') return false;
  if (p.visibility) {
    const visibility = p.visibility.toLowerCase();
    if (visibility !== 'public' && visibility !== 'private') return false;
  }
  return true;
}

function isPublic(p: { visibility?: string }): boolean {
  return !p.visibility || p.visibility.toLowerCase() === 'public';
}

// Build the SSG slug index by paginating /posts. Returns null if the call
// fails so callers can fall back to TTL caching with no static paths.
async function buildIndex(client: RenderedApiClient): Promise<IndexResponse | null> {
  try {
    // Probe without `limit`: the API then pages by the blog's posts_per_page
    // setting, which is also the rendered list's page size — so last_page IS
    // the number of /blog/page/N pages to prerender.
    const probe = await client.fetchPosts(1);
    const perPage = probe.pagination.per_page > 0 ? probe.pagination.per_page : 10;
    const listPages = Math.max(1, probe.pagination.last_page);

    const entries: IndexEntry[] = [];
    const categoryCounts = new Map<string, number>();
    const authorCounts = new Map<string, number>();

    let page = 1;
    while (page <= MAX_WALK_PAGES) {
      const { posts, pagination } = await client.fetchPosts(page, WALK_LIMIT);
      for (const p of posts) {
        if (!isPublishedVisible(p) || !p.slug) continue;
        entries.push({
          slug: p.slug,
          updated_at: p.updatedAt ?? p.modifiedAt ?? p.publishedAt ?? '',
          visibility: p.visibility,
        });
        // Rendered category/author lists exclude private posts, so only
        // public posts count toward the derived pagination bounds.
        if (!isPublic(p)) continue;
        for (const cat of p.categories ?? []) {
          if (cat?.slug) categoryCounts.set(cat.slug, (categoryCounts.get(cat.slug) ?? 0) + 1);
        }
        if (p.author?.slug) authorCounts.set(p.author.slug, (authorCounts.get(p.author.slug) ?? 0) + 1);
      }
      if (page >= pagination.last_page) break;
      if (page === MAX_WALK_PAGES) {
        console.warn(
          `@dropinblog/astro: post index truncated at ${MAX_WALK_PAGES * WALK_LIMIT} posts — remaining posts will not be prerendered.`,
        );
      }
      page += 1;
    }

    const pagesFor = (counts: Map<string, number>): Record<string, number> =>
      Object.fromEntries(
        Array.from(counts, ([slug, count]) => [slug, Math.max(1, Math.ceil(count / perPage))]),
      );

    return {
      entries,
      pages: {
        list: listPages,
        categories: pagesFor(categoryCounts),
        authors: pagesFor(authorCounts),
      },
    };
  } catch (error) {
    console.error('@dropinblog/astro: failed to build the post index:', error);
    return null;
  }
}

// A missing index in a production build would silently ship a site with no
// blog pages — fail the build instead. The dev server degrades gracefully.
async function requireIndex(config: VirtualConfig): Promise<IndexResponse | null> {
  const index = await maybeIndex(config);
  if (index) {
    return index;
  }
  const message =
    '@dropinblog/astro: could not enumerate posts from the DropInBlog API — refusing to build an empty blog. See the error above.';
  if (isDevServer()) {
    console.error(message);
    return null;
  }
  throw new Error(message);
}

// Derived page counts are an upper bound: the rendered list excludes hero
// posts and posts in hidden/private categories, so the real last page can be
// lower. Walk pages 2..bound and stop at the first 404; fetches go through
// the disk cache, so the prerender pass reuses them at no extra cost.
async function walkPages(
  bound: number,
  fetchPage: (page: number) => Promise<RenderedResponse>,
): Promise<number> {
  let last = 1;
  for (let page = 2; page <= bound; page += 1) {
    try {
      await fetchPage(page);
      last = page;
    } catch (error) {
      if (isNotFound(error)) {
        break;
      }
      throw error;
    }
  }
  return last;
}

export function createClient(config: VirtualConfig): RenderedApiClient {
  return new RenderedApiClient(config);
}

export type RenderedKind = 'list' | 'post' | 'category' | 'author';

// Direct fetch with no disk cache — safe on serverless/worker runtimes.
// Used by the server-island component and by SSR-mode page loads.
export function fetchRendered(
  config: VirtualConfig,
  kind: RenderedKind,
  slug?: string,
  page = 1,
): Promise<RenderedResponse> {
  const client = createClient(config);
  switch (kind) {
    case 'post':
      return client.fetchPost(String(slug));
    case 'category':
      return client.fetchCategory(String(slug), page);
    case 'author':
      return client.fetchAuthor(String(slug), page);
    default:
      return client.fetchList(page);
  }
}

// The disk cache only applies when frontmatter runs at build time (ssg and
// island modes). In ssr mode frontmatter runs per request, potentially on a
// runtime with no writable filesystem, so go straight to the API.
export async function loadPost(config: VirtualConfig, slug: string, cacheKey?: string): Promise<RenderedResponse> {
  if (config.mode === 'ssr') {
    return fetchRendered(config, 'post', slug);
  }
  const client = createClient(config);
  const key = postKey(slug, cacheKey ?? FALLBACK_KEY);
  const ttl = cacheKey ? undefined : config.cacheTtlMs;
  return getOrFetch(config.cacheDir, key, () => client.fetchPost(slug), ttl);
}

export async function loadList(config: VirtualConfig, page: number, cacheKey?: string): Promise<RenderedResponse> {
  if (config.mode === 'ssr') {
    return fetchRendered(config, 'list', undefined, page);
  }
  const client = createClient(config);
  const key = listKey(page, cacheKey ?? FALLBACK_KEY);
  const ttl = cacheKey ? undefined : config.cacheTtlMs;
  return getOrFetch(config.cacheDir, key, () => client.fetchList(page), ttl);
}

export async function loadCategory(
  config: VirtualConfig,
  slug: string,
  page: number,
  cacheKey?: string,
): Promise<RenderedResponse> {
  if (config.mode === 'ssr') {
    return fetchRendered(config, 'category', slug, page);
  }
  const client = createClient(config);
  const key = categoryKey(slug, page, cacheKey ?? FALLBACK_KEY);
  const ttl = cacheKey ? undefined : config.cacheTtlMs;
  return getOrFetch(config.cacheDir, key, () => client.fetchCategory(slug, page), ttl);
}

export async function loadAuthor(
  config: VirtualConfig,
  slug: string,
  page: number,
  cacheKey?: string,
): Promise<RenderedResponse> {
  if (config.mode === 'ssr') {
    return fetchRendered(config, 'author', slug, page);
  }
  const client = createClient(config);
  const key = authorKey(slug, page, cacheKey ?? FALLBACK_KEY);
  const ttl = cacheKey ? undefined : config.cacheTtlMs;
  return getOrFetch(config.cacheDir, key, () => client.fetchAuthor(slug, page), ttl);
}

// Cache key for the main list (page 1) — exposed so list.astro can key the
// homepage on content like everything else instead of falling back to TTL.
export async function indexCacheKey(config: VirtualConfig): Promise<string | undefined> {
  if (config.mode === 'ssr') {
    return undefined;
  }
  const index = await maybeIndex(config);
  return index ? indexSignature(index) : undefined;
}

export async function postStaticPaths(config: VirtualConfig): Promise<PostPath[]> {
  const index = await requireIndex(config);
  if (!index) {
    return [];
  }
  return index.entries.map((entry: IndexEntry) => ({
    params: { slug: entry.slug },
    props: {
      cacheKey: entry.updated_at,
      // Private posts are reachable at their slug but should never be indexed.
      ...(isPublic(entry) ? {} : { noindex: true }),
    },
  }));
}

export async function listStaticPaths(config: VirtualConfig): Promise<PagePath[]> {
  const index = await requireIndex(config);
  if (!index) {
    return [];
  }
  const cacheKey = indexSignature(index);
  const bound = index.pages?.list ?? 1;
  const lastPage = await walkPages(bound, (page) => loadList(config, page, cacheKey));
  const paths: PagePath[] = [];
  for (let page = 2; page <= lastPage; page += 1) {
    paths.push({ params: { page: String(page) }, props: { cacheKey } });
  }
  return paths;
}

export async function categoryStaticPaths(config: VirtualConfig): Promise<{ params: { slug: string }; props: { cacheKey: string } }[]> {
  const index = await requireIndex(config);
  if (!index || !index.pages?.categories) {
    return [];
  }
  const cacheKey = indexSignature(index);
  return Object.keys(index.pages.categories).map((slug) => ({
    params: { slug },
    props: { cacheKey },
  }));
}

export async function categoryPageStaticPaths(config: VirtualConfig): Promise<SlugPagePath[]> {
  const index = await requireIndex(config);
  if (!index || !index.pages?.categories) {
    return [];
  }
  const cacheKey = indexSignature(index);
  const perCategory = await Promise.all(
    Object.entries(index.pages.categories).map(async ([slug, bound]) => {
      const lastPage = await walkPages(bound, (page) => loadCategory(config, slug, page, cacheKey));
      const paths: SlugPagePath[] = [];
      for (let page = 2; page <= lastPage; page += 1) {
        paths.push({ params: { slug, page: String(page) }, props: { cacheKey } });
      }
      return paths;
    }),
  );
  return perCategory.flat();
}

export async function authorStaticPaths(config: VirtualConfig): Promise<{ params: { slug: string }; props: { cacheKey: string } }[]> {
  const index = await requireIndex(config);
  if (!index || !index.pages?.authors) {
    return [];
  }
  const cacheKey = indexSignature(index);
  return Object.keys(index.pages.authors).map((slug) => ({
    params: { slug },
    props: { cacheKey },
  }));
}

export async function authorPageStaticPaths(config: VirtualConfig): Promise<SlugPagePath[]> {
  const index = await requireIndex(config);
  if (!index || !index.pages?.authors) {
    return [];
  }
  const cacheKey = indexSignature(index);
  const perAuthor = await Promise.all(
    Object.entries(index.pages.authors).map(async ([slug, bound]) => {
      const lastPage = await walkPages(bound, (page) => loadAuthor(config, slug, page, cacheKey));
      const paths: SlugPagePath[] = [];
      for (let page = 2; page <= lastPage; page += 1) {
        paths.push({ params: { slug, page: String(page) }, props: { cacheKey } });
      }
      return paths;
    }),
  );
  return perAuthor.flat();
}

function indexSignature(index: IndexResponse): string {
  let hash = 5381;
  for (const entry of index.entries) {
    const piece = `${entry.slug}:${entry.updated_at};`;
    for (let i = 0; i < piece.length; i += 1) {
      hash = (hash * 33) ^ piece.charCodeAt(i);
    }
  }
  return (hash >>> 0).toString(16);
}
