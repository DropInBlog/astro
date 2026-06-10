import type { APIRoute } from 'astro';
import config from 'virtual:dropinblog/config';
import { isNotFound, RenderedApiClient } from '../lib/client.js';

export * from 'virtual:dropinblog/paths/category';

function parseType(raw: string | null): 'rss' | 'atom' | undefined {
  return raw === 'atom' ? 'atom' : raw === 'rss' ? 'rss' : undefined;
}

function parseLimit(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const GET: APIRoute = async ({ params, url }) => {
  const slug = String(params.slug);
  const client = new RenderedApiClient(config);
  try {
    const data = await client.fetchCategoryFeed(slug, {
      type: parseType(url.searchParams.get('type')) ?? config.feedType,
      limit: parseLimit(url.searchParams.get('limit')) ?? config.feedLimit,
    });
    const contentType = data.content_type ?? 'application/rss+xml';
    return new Response(data.feed, {
      headers: { 'Content-Type': `${contentType}; charset=utf-8` },
    });
  } catch (error) {
    if (isNotFound(error)) {
      return new Response(null, { status: 404 });
    }
    throw error;
  }
};
