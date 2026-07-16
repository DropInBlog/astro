# @dropinblog/astro

Astro integration for [DropInBlog](https://dropinblog.com/) with static (SSG), server-rendered (SSR), and Server Islands support.

## Features

- DropInBlog - one entry in `astro.config.mjs` injects every route
- Three rendering modes: static, server-rendered, and Server Islands
- Build-time caching - rebuilds skip posts that haven't changed
- SEO-optimized: meta tags, Open Graph, Twitter cards, and JSON-LD on every page
- RSS feeds and XML sitemap included
- Bring your own layout component
- Works with Astro 6 and 7

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

> Use your **public** API token. It is read-only and safe in build environments.

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

- `/blog` - Main blog list
- `/blog/page/{page}` - Paginated blog list
- `/blog/category/{slug}` - Category pages
- `/blog/category/{slug}/page/{page}` - Paginated category pages
- `/blog/author/{slug}` - Author pages
- `/blog/author/{slug}/page/{page}` - Paginated author pages
- `/blog/{slug}` - Single post pages
- `/blog/sitemap.xml` - Sitemap
- `/blog/feed` - RSS feed
- `/blog/category/{slug}/feed` - Category RSS feeds
- `/blog/author/{slug}/feed` - Author RSS feeds

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

Without `<slot name="head" />`, Astro silently drops the head content and meta tags will be missing from your pages.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiToken` | `DROPINBLOG_API_TOKEN` env | DropInBlog public API token |
| `blogId` | `DROPINBLOG_BLOG_ID` env | Your blog ID |
| `basePath` | `'/blog'` | URL prefix for all blog routes |
| `mode` | `'auto'` | `'auto'`, `'ssg'`, `'ssr'`, or `'island'` |
| `layout` | built-in minimal layout | Path to your Astro layout component |
| `cacheTtlMs` | `300000` (5 min) | Build-cache TTL used when per-post freshness data is unavailable |

## Build Hook URL

DropInBlog can notify your site whenever your blog changes. In your DropInBlog dashboard, go to Settings and set the Build Hook URL to any endpoint you choose. DropInBlog sends an HTTP POST request to that URL every time blog content or design changes, including when:

* A post is published, updated, or deleted
* A category or author is added, updated, or deleted
* Layout or design settings are saved

Post events include a JSON body with the `postId` and `slug` of the affected post; other events send an empty payload.

With Astro's default static (`ssg`) mode this is the recommended setup: paste the deploy hook URL from your hosting provider (Vercel, Netlify, Cloudflare, etc.) and every blog change triggers a fresh build, so your published site is never stale. Rebuilds are fast because the build cache skips posts that haven't changed.

In `island` mode, post bodies are fetched on each request, but new posts, SEO tags, and list pages still come from the last build, so a build hook is still recommended. In `ssr` mode every page is rendered per request and you typically don't need it; set one only if you want a webhook for your own automation whenever blog content changes.

## Previewing Posts with Private Visibility

To preview a post before making it public, publish it with **Private** visibility in DropInBlog, then rebuild your site. The post is built at its normal URL (`/blog/{slug}`) so you can view and share it by link, but it stays hidden everywhere else:

- It never appears in blog lists, category/author pages, the sitemap, or RSS feeds.
- The page carries `<meta name="robots" content="noindex">` so search engines won't index it.

Switch the post to Public visibility and rebuild to launch it. Note that "private" means **unlisted, not access-controlled**: anyone with the link can view the page. On static (SSG) builds, content edits require a rebuild to show up.

## License

MIT
