import { describe, expect, it } from '@jest/globals';

import { PACKAGE_NAME } from '../src/index.js';

describe('smoke', () => {
  it('expone el nombre del paquete', () => {
    expect(PACKAGE_NAME).toBe('brms-ts');
  });
});
