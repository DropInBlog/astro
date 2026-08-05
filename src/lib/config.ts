import type { Mode } from './types.js';
import { normalizeBasePath } from './slug.js';

export interface DropInBlogOptions {
  // Falls back to DROPINBLOG_API_KEY env var.
  apiKey?: string;
  /** @deprecated Renamed to apiKey. */
  apiToken?: string;
  // Falls back to DROPINBLOG_BLOG_ID env var.
  blogId?: string;
  basePath?: string;
  apiBaseUrl?: string;
  mode?: Mode;
  cacheTtlMs?: number;
  fields?: string[];
  // Path to an Astro layout component that injected blog routes will wrap
  // their content in. Accepts anything Vite can resolve from the project
  // root (e.g. '/src/layouts/Layout.astro', a `~` alias, or a package
  // import). If omitted, a minimal built-in layout is used.
  layout?: string;
  // Default item count for RSS/Atom feeds. Used as the build-time value in
  // SSG/island mode (query strings don't drive separate prerendered files);
  // in SSR mode this is the fallback when no `?limit=` is supplied.
  feedLimit?: number;
  // Default feed format. Used in SSG/island as above; SSR honors `?type=`.
  feedType?: 'rss' | 'atom';
}

export interface ResolvedOptions {
  apiKey: string;
  blogId: string;
  basePath: string;
  apiBaseUrl: string;
  mode: Mode;
  cacheTtlMs: number;
  fields: string[];
  layout: string | undefined;
  feedLimit: number | undefined;
  feedType: 'rss' | 'atom' | undefined;
  // Messages for legacy names still in use, logged by the integration once
  // the Astro logger is available. Not part of the virtual config.
  deprecations: string[];
}

const DEFAULT_FIELDS = ['head_data', 'body_html'];
const DEFAULT_API_BASE = 'https://api.dropinblog.com/v2';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export function resolveOptions(opts: DropInBlogOptions = {}): ResolvedOptions {
  // Options beat env vars; the current names beat the legacy ones they
  // replaced. Blank values fall through so a half-finished rename in .env
  // still picks up the old variable rather than failing the build.
  const apiKey =
    opts.apiKey || opts.apiToken || process.env.DROPINBLOG_API_KEY || process.env.DROPINBLOG_API_TOKEN;
  const blogId = opts.blogId ?? process.env.DROPINBLOG_BLOG_ID;

  if (!apiKey) {
    throw new Error(
      '@dropinblog/astro: apiKey is required. Pass it as an option or set DROPINBLOG_API_KEY.',
    );
  }
  if (!blogId) {
    throw new Error(
      '@dropinblog/astro: blogId is required. Pass it as an option or set DROPINBLOG_BLOG_ID.',
    );
  }

  // Warn only about the legacy source that actually supplied the value.
  const deprecations: string[] = [];
  if (!opts.apiKey) {
    if (opts.apiToken) {
      deprecations.push('the "apiToken" option is deprecated — rename it to "apiKey".');
    } else if (!process.env.DROPINBLOG_API_KEY) {
      deprecations.push('DROPINBLOG_API_TOKEN is deprecated — rename it to DROPINBLOG_API_KEY.');
    }
  }

  return {
    apiKey,
    blogId,
    basePath: normalizeBasePath(opts.basePath ?? '/blog'),
    apiBaseUrl: opts.apiBaseUrl ?? DEFAULT_API_BASE,
    mode: opts.mode ?? 'auto',
    cacheTtlMs: opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    fields: opts.fields ?? DEFAULT_FIELDS,
    layout: opts.layout,
    feedLimit: opts.feedLimit,
    feedType: opts.feedType,
    deprecations,
  };
}
