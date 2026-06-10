import { describe, expect, it } from 'vitest';
import { resolveMode } from '../src/lib/mode.js';

const adapter = { name: '@astrojs/node' };

describe('resolveMode', () => {
  it('passes explicit modes through unchanged', () => {
    expect(resolveMode('ssg', { output: 'server', adapter })).toBe('ssg');
    expect(resolveMode('ssr', { output: 'static', adapter: undefined })).toBe('ssr');
    expect(resolveMode('island', { output: 'static', adapter: undefined })).toBe('island');
  });

  it('auto resolves to ssr for server output', () => {
    expect(resolveMode('auto', { output: 'server', adapter })).toBe('ssr');
    expect(resolveMode('auto', { output: 'server', adapter: undefined })).toBe('ssr');
  });

  it('auto resolves to island for static output with an adapter', () => {
    expect(resolveMode('auto', { output: 'static', adapter })).toBe('island');
  });

  it('auto resolves to ssg for static output without an adapter', () => {
    expect(resolveMode('auto', { output: 'static', adapter: undefined })).toBe('ssg');
  });
});
