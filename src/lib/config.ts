import { createRequire } from 'node:module';
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

// Astro fills process.env from .env files only after astro.config.mjs has
// loaded, and dropInBlog() runs while it loads, so read the files with Vite's
// loadEnv (Astro sets NODE_ENV to the build or dev mode first). Vite is
// resolved through Astro because strict installs such as pnpm don't let this
// package import it directly. Variables already in process.env still win.
function readDotEnv(): Record<string, string | undefined> {
  try {
    const astroRequire = createRequire(createRequire(import.meta.url).resolve('astro/package.json'));
    const { loadEnv } = astroRequire('vite') as typeof import('vite');
    return loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'DROPINBLOG_');
  } catch {
    return process.env;
  }
}

export function resolveOptions(opts: DropInBlogOptions = {}): ResolvedOptions {
  const env = (opts.apiKey || opts.apiToken) && opts.blogId ? process.env : readDotEnv();
  // Options beat env vars; the current names beat the legacy ones they
  // replaced. Blank values fall through so a half-finished rename in .env
  // still picks up the old variable rather than failing the build.
  const apiKey = opts.apiKey || opts.apiToken || env.DROPINBLOG_API_KEY || env.DROPINBLOG_API_TOKEN;
  const blogId = opts.blogId ?? env.DROPINBLOG_BLOG_ID;

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
    } else if (!env.DROPINBLOG_API_KEY) {
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
