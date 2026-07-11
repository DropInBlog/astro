import type {
  FeedResponse,
  PostsResponse,
  RenderedResponse,
  SitemapResponse,
  VirtualConfig,
} from './types.js';
import { PACKAGE_VERSION } from './version.js';

interface ApiEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DropInBlogApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly apiCode?: number,
  ) {
    super(message);
    this.name = 'DropInBlogApiError';
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof DropInBlogApiError && error.status === 404;
}

export class RenderedApiClient {
  constructor(private readonly opts: Pick<VirtualConfig, 'apiBaseUrl' | 'apiToken' | 'blogId' | 'fields' | 'mode'>) {}

  private url(path: string, params: Record<string, string | number | undefined> = {}, fieldsOverride?: string): string {
    const url = new URL(`${this.opts.apiBaseUrl}/blog/${this.opts.blogId}/rendered${path}`);
    const fields = fieldsOverride ?? this.opts.fields.join(',');
    if (fields) {
      url.searchParams.set('fields', fields);
    }
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private rawUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
    const url = new URL(`${this.opts.apiBaseUrl}/blog/${this.opts.blogId}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async get<T>(url: string): Promise<T> {
    const attempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.opts.apiToken}`,
            'X-Dib-Package': `astro@${PACKAGE_VERSION}+${this.opts.mode}`,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          if (retryable && attempt < attempts) {
            lastError = new DropInBlogApiError(`DropInBlog API ${res.status} for ${url}`, res.status);
            await delay(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          const body = await res.text().catch(() => '');
          let apiCode: number | undefined;
          try {
            apiCode = (JSON.parse(body) as ApiEnvelope<unknown>).code;
          } catch {
            apiCode = undefined;
          }
          throw new DropInBlogApiError(
            `DropInBlog API ${res.status} for ${url}: ${body.slice(0, 200)}`,
            res.status,
            apiCode,
          );
        }
        const envelope = (await res.json()) as ApiEnvelope<T>;
        if (!envelope.success) {
          throw new DropInBlogApiError(
            `DropInBlog API error (code ${envelope.code}): ${envelope.message}`,
            res.status,
            envelope.code,
          );
        }
        return envelope.data;
      } catch (error) {
        // Network failures and timeouts are retryable; API-level errors
        // (thrown above as DropInBlogApiError) are not.
        if (error instanceof DropInBlogApiError) {
          throw error;
        }
        lastError = error;
        if (attempt < attempts) {
          await delay(RETRY_BASE_DELAY_MS * attempt);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`DropInBlog API request failed after ${attempts} attempts: ${url}`);
  }

  fetchList(page?: number): Promise<RenderedResponse> {
    return this.get<RenderedResponse>(this.url('/list', { page }));
  }

  fetchPost(slug: string): Promise<RenderedResponse> {
    return this.get<RenderedResponse>(this.url(`/post/${encodeURIComponent(slug)}`));
  }

  fetchCategory(slug: string, page?: number): Promise<RenderedResponse> {
    return this.get<RenderedResponse>(this.url(`/list/category/${encodeURIComponent(slug)}`, { page }));
  }

  fetchAuthor(slug: string, page?: number): Promise<RenderedResponse> {
    return this.get<RenderedResponse>(this.url(`/list/author/${encodeURIComponent(slug)}`, { page }));
  }

  fetchSitemap(): Promise<SitemapResponse> {
    return this.get<SitemapResponse>(this.url('/sitemap', {}, ''));
  }

  fetchFeed(opts: { type?: 'rss' | 'atom'; limit?: number } = {}): Promise<FeedResponse> {
    return this.get<FeedResponse>(this.url('/feed', opts, ''));
  }

  fetchCategoryFeed(slug: string, opts: { type?: 'rss' | 'atom'; limit?: number } = {}): Promise<FeedResponse> {
    return this.get<FeedResponse>(this.url(`/feed/category/${encodeURIComponent(slug)}`, opts, ''));
  }

  fetchAuthorFeed(slug: string, opts: { type?: 'rss' | 'atom'; limit?: number } = {}): Promise<FeedResponse> {
    return this.get<FeedResponse>(this.url(`/feed/author/${encodeURIComponent(slug)}`, opts, ''));
  }

  // Raw posts list — used by SSG to enumerate slugs for getStaticPaths.
  // Hits the documented /v2/blog/{id}/posts endpoint (not /rendered).
  // Filters are passed explicitly rather than relying on API defaults.
  // Omitting `limit` makes the API use the blog's posts_per_page setting,
  // which the index probe relies on to learn the rendered page size.
  fetchPosts(page?: number, limit?: number): Promise<PostsResponse> {
    return this.get<PostsResponse>(this.rawUrl('/posts', {
      page,
      limit,
      statuses: 'published',
      visibilities: 'public',
    }));
  }
}
