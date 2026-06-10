import { describe, expect, it } from 'vitest';
import { normalizeBasePath } from '../src/lib/slug.js';

describe('normalizeBasePath', () => {
  it('adds a leading slash', () => {
    expect(normalizeBasePath('blog')).toBe('/blog');
  });

  it('strips trailing slashes', () => {
    expect(normalizeBasePath('/blog/')).toBe('/blog');
  });

  it('handles nested paths', () => {
    expect(normalizeBasePath('resources/blog')).toBe('/resources/blog');
  });

  it('falls back to /blog for empty input', () => {
    expect(normalizeBasePath('')).toBe('/blog');
    expect(normalizeBasePath('/')).toBe('/blog');
    expect(normalizeBasePath('   ')).toBe('/blog');
  });
});
