export type Mode = 'auto' | 'ssg' | 'ssr' | 'island';

export type ResolvedMode = Exclude<Mode, 'auto'>;

export interface HeadData {
  title?: string;
  description?: string;
  canonical_url?: string;
  rss_url?: string;
  seo_url_next?: string;
  seo_url_prev?: string;
  image?: string;
  css?: string;
  css_link?: string;
  schema?: string;
  fonts?: string[];
  js?: string;
  js_search?: string;
  noindex?: boolean;
}

export interface RenderedResponse {
  body_html?: string;
  head_data?: HeadData;
  head_html?: string;
  head_items?: Record<string, string>;
  content_type?: string;
  slug?: string;
  [extra: string]: unknown;
}

export interface SitemapResponse {
  sitemap: string;
  content_type?: string;
}

export interface FeedResponse {
  feed: string;
  content_type?: string;
}

export interface IndexEntry {
  slug: string;
  updated_at: string;
  visibility?: string;
}

export interface IndexResponse {
  entries: IndexEntry[];
  pages?: {
    list?: number;
    categories?: Record<string, number>;
    authors?: Record<string, number>;
  };
}

// Shape of /v2/blog/{blog_id}/posts (raw data endpoint).
// Only the fields we actually consume are typed; the API returns more.
export interface PostsApiPost {
  slug: string;
  status?: string;
  visibility?: string;
  publishedAt?: string;
  updatedAt?: string;
  modifiedAt?: string;
  categories?: Array<{ slug: string }>;
  author?: { slug: string } | null;
}

export interface PostsApiPagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
  previous_page_url: string | null;
  next_page_url: string | null;
}

export interface PostsResponse {
  posts: PostsApiPost[];
  pagination: PostsApiPagination;
}

export interface VirtualConfig {
  apiToken: string;
  blogId: string;
  basePath: string;
  apiBaseUrl: string;
  mode: ResolvedMode;
  cacheTtlMs: number;
  fields: string[];
  cacheDir: string;
  feedLimit: number | undefined;
  feedType: 'rss' | 'atom' | undefined;
}
