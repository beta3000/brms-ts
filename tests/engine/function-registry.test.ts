import { describe, expect, it } from '@jest/globals';

import { UnknownReferenceError } from '../../src/engine/errors.js';
import { FunctionRegistry } from '../../src/engine/function-registry.js';
import type { Fact } from '../../src/model/fact.js';

const fact: Fact = { type: 'X', attributes: {} };

describe('FunctionRegistry', () => {
  it('registers and resolves a predicate', () => {
    const registry = new FunctionRegistry();
    registry.registerPredicate('always', () => true);
    expect(registry.hasPredicate('always')).toBe(true);
    expect(registry.getPredicate('always')(fact, [])).toBe(true);
  });

  it('registers and resolves a function', () => {
    const registry = new FunctionRegistry();
    let called = false;
    registry.registerFunction('noop', () => {
      called = true;
    });
    expect(registry.hasFunction('noop')).toBe(true);
    registry.getFunction('noop')([fact], []);
    expect(called).toBe(true);
  });

  it('supports chaining', () => {
    const registry = new FunctionRegistry();
    const result = registry
      .registerPredicate('p', () => true)
      .registerFunction('f', () => undefined);
    expect(result).toBe(registry);
  });

  it('throws UnknownReferenceError for a missing predicate', () => {
    const registry = new FunctionRegistry();
    expect(() => registry.getPredicate('nope')).toThrow(UnknownReferenceError);
    expect(registry.hasPredicate('nope')).toBe(false);
  });

  it('throws UnknownReferenceError for a missing function', () => {
    const registry = new FunctionRegistry();
    expect(() => registry.getFunction('nope')).toThrow(UnknownReferenceError);
    expect(registry.hasFunction('nope')).toBe(false);
  });
});
