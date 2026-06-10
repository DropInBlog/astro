import type { AstroIntegration } from 'astro';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { resolveOptions, type DropInBlogOptions } from './lib/config.js';
import { resolveMode } from './lib/mode.js';
import { virtualConfigPlugin } from './lib/virtual-module.js';

export type { DropInBlogOptions };

const HEADERS_MARKER_START = '# >>> @dropinblog/astro';
const HEADERS_MARKER_END = '# <<< @dropinblog/astro';

// Filenames of every route this integration injects — used by the
// astro:route:setup hook to set prerender per resolved mode. Astro cannot
// evaluate `export const prerender = <expression>` (only bare literals), so
// the hook is the authoritative switch.
const ROUTE_FILES = new Set([
  'list.astro',
  'list-page.astro',
  'post.astro',
  'category.astro',
  'category-page.astro',
  'author.astro',
  'author-page.astro',
  'sitemap.xml.ts',
  'feed.ts',
  'category-feed.ts',
  'author-feed.ts',
]);

function isOwnRoute(component: string): boolean {
  const normalized = component.replace(/\\/g, '/');
  // The .ts endpoints are injected via their compiled dist/*.js paths.
  const fileName = (normalized.split('/routes/').pop() ?? '').replace(/\.js$/, '.ts');
  if (!ROUTE_FILES.has(fileName)) {
    return false;
  }
  return normalized.includes('@dropinblog/astro') || normalized.includes('astro-rendered');
}

const CACHE_NAMESPACE = '@dropinblog-astro';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Content-keyed cache entries are written forever (each post edit mints a
// new key); sweep stale files so persisted CI caches don't grow unbounded.
async function pruneCache(cacheDir: string): Promise<void> {
  const { readdir, stat, unlink } = await import('node:fs/promises');
  const dir = join(cacheDir, CACHE_NAMESPACE);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - CACHE_MAX_AGE_MS;
  for (const name of names) {
    try {
      const file = join(dir, name);
      const info = await stat(file);
      if (info.mtimeMs < cutoff) {
        await unlink(file);
      }
    } catch {
      // Best effort — pruning must never fail a build.
    }
  }
}

async function writeStaticHostHeaders(distDir: string, basePath: string): Promise<void> {
  const block = [
    HEADERS_MARKER_START,
    `${basePath}/feed`,
    '  Content-Type: application/rss+xml; charset=utf-8',
    `${basePath}/category/*/feed`,
    '  Content-Type: application/rss+xml; charset=utf-8',
    `${basePath}/author/*/feed`,
    '  Content-Type: application/rss+xml; charset=utf-8',
    HEADERS_MARKER_END,
    '',
  ].join('\n');

  const headersPath = join(distDir, '_headers');
  let existing = '';
  if (existsSync(headersPath)) {
    existing = await readFile(headersPath, 'utf8');
    const startIdx = existing.indexOf(HEADERS_MARKER_START);
    const endIdx = existing.indexOf(HEADERS_MARKER_END);
    if (startIdx !== -1 && endIdx > startIdx) {
      existing = existing.slice(0, startIdx) + existing.slice(endIdx + HEADERS_MARKER_END.length + 1);
    }
  }
  if (existing !== '' && !existing.endsWith('\n')) {
    existing += '\n';
  }
  await writeFile(headersPath, existing + block, 'utf8');
}

export default function dropInBlog(userOptions: DropInBlogOptions = {}): AstroIntegration {
  const options = resolveOptions(userOptions);
  const base = options.basePath;
  // Shared with the Vite plugin, which serializes the virtual config module
  // lazily — after astro:config:done has settled the final mode.
  const modeRef: { current: 'ssg' | 'ssr' | 'island' } = { current: 'ssg' };
  let cacheDirPath: string | undefined;

  return {
    name: '@dropinblog/astro',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config, logger }) => {
        const cacheDir = fileURLToPath(config.cacheDir);
        cacheDirPath = cacheDir;
        modeRef.current = resolveMode(options.mode, {
          output: config.output,
          adapter: config.adapter,
        });

        updateConfig({
          vite: {
            plugins: [virtualConfigPlugin(options, modeRef, cacheDir)],
          },
        });

        injectRoute({
          pattern: base,
          entrypoint: '@dropinblog/astro/routes/list.astro',
        });
        injectRoute({
          pattern: `${base}/page/[page]`,
          entrypoint: '@dropinblog/astro/routes/list-page.astro',
        });
        injectRoute({
          pattern: `${base}/category/[slug]`,
          entrypoint: '@dropinblog/astro/routes/category.astro',
        });
        injectRoute({
          pattern: `${base}/category/[slug]/page/[page]`,
          entrypoint: '@dropinblog/astro/routes/category-page.astro',
        });
        injectRoute({
          pattern: `${base}/author/[slug]`,
          entrypoint: '@dropinblog/astro/routes/author.astro',
        });
        injectRoute({
          pattern: `${base}/author/[slug]/page/[page]`,
          entrypoint: '@dropinblog/astro/routes/author-page.astro',
        });
        injectRoute({
          pattern: `${base}/sitemap.xml`,
          entrypoint: '@dropinblog/astro/routes/sitemap.xml.ts',
        });
        injectRoute({
          pattern: `${base}/feed`,
          entrypoint: '@dropinblog/astro/routes/feed.ts',
        });
        injectRoute({
          pattern: `${base}/category/[slug]/feed`,
          entrypoint: '@dropinblog/astro/routes/category-feed.ts',
        });
        injectRoute({
          pattern: `${base}/author/[slug]/feed`,
          entrypoint: '@dropinblog/astro/routes/author-feed.ts',
        });
        injectRoute({
          pattern: `${base}/[slug]`,
          entrypoint: '@dropinblog/astro/routes/post.astro',
        });

        logger.info(`@dropinblog/astro: registered routes under ${base}`);
      },
      'astro:route:setup': ({ route }) => {
        // Astro only honors literal `export const prerender = true|false`
        // in route files; ours depend on the resolved mode, so set the flag
        // here. This also makes mode:'ssr' work under output:'static' and
        // keeps island shells prerendered under output:'server'.
        if (isOwnRoute(route.component)) {
          route.prerender = modeRef.current !== 'ssr';
        }
      },
      'astro:config:done': ({ config, logger }) => {
        modeRef.current = resolveMode(options.mode, {
          output: config.output,
          adapter: config.adapter,
        });
        if ((modeRef.current === 'ssr' || modeRef.current === 'island') && !config.adapter) {
          logger.error(
            `@dropinblog/astro: mode "${modeRef.current}" requires an SSR adapter (e.g. @astrojs/cloudflare, @astrojs/node, @astrojs/vercel).`,
          );
        }
        logger.info(`@dropinblog/astro: resolved mode = ${modeRef.current}`);
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (modeRef.current !== 'ssg' && modeRef.current !== 'island') return;
        // SSR adapters honor Response headers at request time; static hosts
        // don't, so emit a `_headers` rule that Cloudflare Pages and Netlify
        // (and other compatible hosts) will pick up for the extension-less
        // feed file written to disk.
        try {
          await writeStaticHostHeaders(fileURLToPath(dir), base);
          logger.info(`@dropinblog/astro: wrote _headers rule for ${base}/feed`);
        } catch (err) {
          logger.warn(`@dropinblog/astro: failed to write _headers — ${err instanceof Error ? err.message : String(err)}`);
        }
        if (cacheDirPath) {
          await pruneCache(cacheDirPath);
        }
      },
    },
  };
}
