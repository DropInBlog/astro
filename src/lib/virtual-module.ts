import type { Plugin } from 'vite';
import type { ResolvedMode, VirtualConfig } from './types.js';
import type { ResolvedOptions } from './config.js';

const CONFIG_VIRTUAL_ID = 'virtual:dropinblog/config';
const CONFIG_RESOLVED_ID = '\0' + CONFIG_VIRTUAL_ID;

const LAYOUT_VIRTUAL_ID = 'virtual:dropinblog/layout';
const LAYOUT_RESOLVED_ID = '\0' + LAYOUT_VIRTUAL_ID;

const BODY_VIRTUAL_ID = 'virtual:dropinblog/body';
const BODY_RESOLVED_ID = '\0' + BODY_VIRTUAL_ID;

const PATHS_VIRTUAL_PREFIX = 'virtual:dropinblog/paths/';
const PATHS_RESOLVED_PREFIX = '\0' + PATHS_VIRTUAL_PREFIX;

const DEFAULT_LAYOUT_IMPORT = '@dropinblog/astro/components/DefaultLayout.astro';
const BODY_STATIC_IMPORT = '@dropinblog/astro/components/DibBlogBody.astro';
const BODY_ISLAND_IMPORT = '@dropinblog/astro/components/DibBlogBodyIsland.astro';

// Astro warns whenever the literal string "getStaticPaths" appears in a
// non-prerendered route file (vite-plugin-routes does a raw substring scan).
// Routes therefore re-export their paths function from these virtual modules
// via `export *` — in ssr mode the module is empty, so neither the string nor
// the export ever reaches the route.
const PATH_FUNCTIONS: Record<string, string> = {
  'post': 'postStaticPaths',
  'list-page': 'listStaticPaths',
  'category': 'categoryStaticPaths',
  'category-page': 'categoryPageStaticPaths',
  'author': 'authorStaticPaths',
  'author-page': 'authorPageStaticPaths',
};

export interface ModeRef {
  current: ResolvedMode;
}

export function virtualConfigPlugin(
  opts: ResolvedOptions,
  modeRef: ModeRef,
  cacheDir: string,
): Plugin {
  const layoutImport = opts.layout ?? DEFAULT_LAYOUT_IMPORT;

  return {
    name: 'dropinblog:virtual-config',
    enforce: 'pre',
    resolveId(id) {
      if (id === CONFIG_VIRTUAL_ID) return CONFIG_RESOLVED_ID;
      if (id === LAYOUT_VIRTUAL_ID) return LAYOUT_RESOLVED_ID;
      if (id === BODY_VIRTUAL_ID) return BODY_RESOLVED_ID;
      if (id.startsWith(PATHS_VIRTUAL_PREFIX)) return '\0' + id;
      return null;
    },
    load(id) {
      if (id === CONFIG_RESOLVED_ID) {
        // Serialized at load time (after astro:config:done) so modeRef holds
        // the final resolved mode, including adapter detection.
        const config: VirtualConfig = {
          apiToken: opts.apiToken,
          blogId: opts.blogId,
          basePath: opts.basePath,
          apiBaseUrl: opts.apiBaseUrl,
          mode: modeRef.current,
          cacheTtlMs: opts.cacheTtlMs,
          fields: opts.fields,
          cacheDir,
          feedLimit: opts.feedLimit,
          feedType: opts.feedType,
        };
        return `export default Object.freeze(${JSON.stringify(config)});`;
      }
      if (id === LAYOUT_RESOLVED_ID) {
        return `export { default } from ${JSON.stringify(layoutImport)};`;
      }
      if (id === BODY_RESOLVED_ID) {
        // Resolved at load time (post astro:config:done). The server:defer
        // directive only enters the module graph in island mode, so static
        // builds never require an adapter.
        const bodyImport = modeRef.current === 'island' ? BODY_ISLAND_IMPORT : BODY_STATIC_IMPORT;
        return `export { default } from ${JSON.stringify(bodyImport)};`;
      }
      if (id.startsWith(PATHS_RESOLVED_PREFIX)) {
        const kind = id.slice(PATHS_RESOLVED_PREFIX.length);
        const fn = PATH_FUNCTIONS[kind];
        if (!fn) return null;
        if (modeRef.current === 'ssr') {
          return 'export {};';
        }
        return [
          `import config from ${JSON.stringify(CONFIG_VIRTUAL_ID)};`,
          `import { ${fn} } from '@dropinblog/astro/runtime';`,
          `export function getStaticPaths() { return ${fn}(config); }`,
        ].join('\n');
      }
      return null;
    },
  };
}
