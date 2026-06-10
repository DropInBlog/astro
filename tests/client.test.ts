import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderedApiClient } from '../src/lib/client.js';

const baseOpts = {
  apiBaseUrl: 'https://api.example.com/v2',
  apiToken: 'test-token',
  blogId: 'blog-1',
  fields: ['head_data', 'body_html'],
};

function mockFetch(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RenderedApiClient', () => {
  it('builds URLs with fields and bearer auth', async () => {
    const fn = mockFetch({ success: true, code: 0, message: 'OK', data: { body_html: 'x' } });
    const client = new RenderedApiClient(baseOpts);
    await client.fetchPost('my-post');

    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v2/blog/blog-1/rendered/post/my-post?fields=head_data%2Cbody_html');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('adds the page param to list calls', async () => {
    const fn = mockFetch({ success: true, code: 0, message: 'OK', data: {} });
    const client = new RenderedApiClient(baseOpts);
    await client.fetchList(3);
    expect(fn.mock.calls[0]?.[0]).toContain('page=3');
  });

  it('omits fields for feed endpoints but passes type and limit', async () => {
    const fn = mockFetch({ success: true, code: 0, message: 'OK', data: { feed: '<rss/>' } });
    const client = new RenderedApiClient(baseOpts);
    await client.fetchFeed({ type: 'atom', limit: 5 });

    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).not.toContain('fields=');
    expect(url).toContain('type=atom');
    expect(url).toContain('limit=5');
  });

  it('unwraps the response envelope', async () => {
    mockFetch({ success: true, code: 0, message: 'OK', data: { body_html: '<p>hi</p>' } });
    const client = new RenderedApiClient(baseOpts);
    const data = await client.fetchList();
    expect(data).toEqual({ body_html: '<p>hi</p>' });
  });

  it('throws on HTTP errors', async () => {
    mockFetch({ success: false, code: 1002, message: 'Not found' }, { ok: false, status: 404 });
    const client = new RenderedApiClient(baseOpts);
    await expect(client.fetchPost('missing')).rejects.toThrow(/404/);
  });

  it('throws on unsuccessful envelopes', async () => {
    mockFetch({ success: false, code: 1001, message: 'Blog unavailable', data: null });
    const client = new RenderedApiClient(baseOpts);
    await expect(client.fetchList()).rejects.toThrow(/1001/);
  });

  it('encodes slugs in URLs', async () => {
    const fn = mockFetch({ success: true, code: 0, message: 'OK', data: {} });
    const client = new RenderedApiClient(baseOpts);
    await client.fetchCategory('news & updates');
    expect(fn.mock.calls[0]?.[0]).toContain('/list/category/news%20%26%20updates');
  });

  it('retries on 5xx and succeeds', async () => {
    const good = { success: true, code: 0, message: 'OK', data: { body_html: 'ok' } };
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' };
      }
      return { ok: true, status: 200, json: async () => good, text: async () => JSON.stringify(good) };
    });
    vi.stubGlobal('fetch', fn);
    const client = new RenderedApiClient(baseOpts);
    const data = await client.fetchList();
    expect(data).toEqual({ body_html: 'ok' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable HTTP errors', async () => {
    const fn = mockFetch({ success: false, code: 1002, message: 'Not found' }, { ok: false, status: 404 });
    const client = new RenderedApiClient(baseOpts);
    await expect(client.fetchPost('missing')).rejects.toThrow(/404/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries network errors and gives up after 3 attempts', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fn);
    const client = new RenderedApiClient(baseOpts);
    await expect(client.fetchList()).rejects.toThrow(/fetch failed/);
    expect(fn).toHaveBeenCalledTimes(3);
  }, 10_000);
});
