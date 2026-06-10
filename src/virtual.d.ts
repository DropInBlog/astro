declare module 'virtual:dropinblog/config' {
  interface VirtualConfig {
    apiToken: string;
    blogId: string;
    basePath: string;
    apiBaseUrl: string;
    mode: 'ssg' | 'ssr' | 'island';
    cacheTtlMs: number;
    fields: string[];
    cacheDir: string;
    feedLimit: number | undefined;
    feedType: 'rss' | 'atom' | undefined;
  }
  const config: VirtualConfig;
  export default config;
}

declare module 'virtual:dropinblog/layout' {
  // Re-export of the user-configured layout component, or the built-in
  // DefaultLayout when no layout option is provided.
  const Layout: (props: { title?: string }) => unknown;
  export default Layout;
}

declare module 'virtual:dropinblog/paths/*' {
  // getStaticPaths re-exported by routes; empty module in ssr mode so the
  // identifier never appears in non-prerendered route files.
  export function getStaticPaths(): Promise<Array<{ params: Record<string, string>; props?: Record<string, unknown> }>>;
}

declare module 'virtual:dropinblog/body' {
  // Body renderer selected by the resolved mode: DibBlogBody.astro for
  // ssg/ssr, DibBlogBodyIsland.astro (server:defer) for island mode.
  const Body: (props: {
    kind: 'list' | 'post' | 'category' | 'author';
    slug?: string;
    page?: number;
    body_html?: string;
  }) => unknown;
  export default Body;
}
