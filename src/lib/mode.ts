import type { Mode, ResolvedMode } from './types.js';

export interface ModeContext {
  output: 'static' | 'server';
  adapter: { name: string } | undefined;
}

export function resolveMode(mode: Mode, ctx: ModeContext): ResolvedMode {
  if (mode !== 'auto') {
    return mode;
  }
  if (ctx.output === 'server') {
    return 'ssr';
  }
  if (ctx.adapter) {
    return 'island';
  }
  return 'ssg';
}
