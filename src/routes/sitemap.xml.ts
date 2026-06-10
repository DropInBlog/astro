import type { APIRoute } from 'astro';
import config from 'virtual:dropinblog/config';
import { isNotFound, RenderedApiClient } from '../lib/client.js';

export const GET: APIRoute = async () => {
  const client = new RenderedApiClient(config);
  try {
    const data = await client.fetchSitemap();
    return new Response(data.sitemap, {
      headers: { 'Content-Type': data.content_type ?? 'application/xml' },
    });
  } catch (error) {
    if (isNotFound(error)) {
      return new Response(null, { status: 404 });
    }
    throw error;
  }
};
