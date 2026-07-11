import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { PACKAGE_VERSION } from '../src/lib/version.js';

describe('PACKAGE_VERSION', () => {
  it('matches the version in package.json', () => {
    expect(PACKAGE_VERSION).toBe(pkg.version);
  });

  it('is safe for the X-Dib-Package header, including the longest mode suffix', () => {
    expect(`${PACKAGE_VERSION}+island`).toMatch(/^[0-9A-Za-z.\-+]{1,32}$/);
  });
});
