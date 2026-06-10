# @dropinblog/astro

Astro integration for [DropInBlog](https://dropinblog.com/) with static (SSG), server-rendered (SSR), and Server Islands support.

## Features

- DropInBlog - one entry in `astro.config.mjs` injects every route
- Three rendering modes: static, server-rendered, and Server Islands
- Build-time caching - rebuilds skip posts that haven't changed
- SEO-optimized: meta tags, Open Graph, Twitter cards, and JSON-LD on every page
- RSS feeds and XML sitemap included
- Bring your own layout component
- Works with Astro 5 and 6

## Installation

```bash
npm install @dropinblog/astro
```

## Quick Start

### 1. Configure Environment Variables

Create a `.env` file in your Astro project. These are read server-side at build time, so do not prefix them with `PUBLIC_` to avoid exposing credentials to the browser:

```env
DROPINBLOG_BLOG_ID=your_dropinblog_blog_id
DROPINBLOG_API_TOKEN=your_dropinblog_api_token
```

> Use your **public** API token — it is read-only and safe in build environments.

### 2. Add the Integration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import dropInBlog from '@dropinblog/astro';

export default defineConfig({
  site: 'https://yoursite.com',
  integrations: [dropInBlog()],
});
```

Routes registered by the integration:

- `/blog` – Main blog list
- `/blog/page/{page}` – Paginated blog list
- `/blog/category/{slug}` – Category pages
- `/blog/category/{slug}/page/{page}` – Paginated category pages
- `/blog/author/{slug}` – Author pages
- `/blog/author/{slug}/page/{page}` – Paginated author pages
- `/blog/{slug}` – Single post pages
- `/blog/sitemap.xml` – Sitemap
- `/blog/feed` – RSS feed
- `/blog/category/{slug}/feed` – Category RSS feeds
- `/blog/author/{slug}/feed` – Author RSS feeds

To mount the blog at a different path (e.g. `/news`), pass `basePath`:

```js
dropInBlog({ basePath: '/news' })
```

Ensure your blog's URL in DropInBlog settings matches where the routes are mounted so permalinks, canonical tags, RSS, and the sitemap all align.

### 3. Add a Head Slot to Your Layout

By default blog pages use a minimal built-in layout. To use your own, pass its path:

```js
dropInBlog({ layout: '/src/layouts/Layout.astro' })
```

Your layout receives a `title` prop and the blog content through its default `<slot />`. It **must** include a named `head` slot inside `<head>`. That's where the integration places SEO meta tags, Open Graph/Twitter tags, canonical URL, JSON-LD schema, fonts, and styles:

```astro
---
const { title } = Astro.props;
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>{title}</title>
    <slot name="head" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

Without `<slot name="head" />`, Astro silently drops the head content — meta tags will be missing from your pages.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiToken` | `DROPINBLOG_API_TOKEN` env | DropInBlog public API token |
| `blogId` | `DROPINBLOG_BLOG_ID` env | Your blog ID |
| `basePath` | `'/blog'` | URL prefix for all blog routes |
| `mode` | `'auto'` | `'auto'`, `'ssg'`, `'ssr'`, or `'island'` |
| `layout` | built-in minimal layout | Path to your Astro layout component |
| `cacheTtlMs` | `300000` (5 min) | Build-cache TTL used when per-post freshness data is unavailable |

## License

MIT
