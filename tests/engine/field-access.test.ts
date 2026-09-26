import { describe, expect, it } from '@jest/globals';

import { isFieldReference, readFieldPath, resolveValue } from '../../src/engine/field-access.js';
import type { Fact } from '../../src/model/fact.js';

describe('readFieldPath', () => {
  const source = {
    name: 'Ada',
    address: { city: 'London', zip: null },
    tags: ['a', 'b', 'c'],
  };

  it('reads a top-level field', () => {
    expect(readFieldPath(source, 'name')).toBe('Ada');
  });

  it('reads a nested field with dot notation', () => {
    expect(readFieldPath(source, 'address.city')).toBe('London');
  });

  it('reads an array element by index', () => {
    expect(readFieldPath(source, 'tags.1')).toBe('b');
  });

  it('returns undefined for a missing field', () => {
    expect(readFieldPath(source, 'address.country')).toBeUndefined();
  });

  it('returns undefined when traversing through a non-object', () => {
    expect(readFieldPath(source, 'name.length')).toBeUndefined();
  });

  it('returns undefined for out-of-range array index', () => {
    expect(readFieldPath(source, 'tags.9')).toBeUndefined();
  });

  it('returns undefined for non-integer array index', () => {
    expect(readFieldPath(source, 'tags.x')).toBeUndefined();
  });

  it('preserves an explicit null value', () => {
    expect(readFieldPath(source, 'address.zip')).toBeNull();
  });

  it('refuses prototype-polluting segments', () => {
    expect(readFieldPath(source, '__proto__')).toBeUndefined();
    expect(readFieldPath(source, 'constructor.prototype')).toBeUndefined();
    expect(readFieldPath(source, 'address.__proto__.polluted')).toBeUndefined();
  });
});

describe('isFieldReference', () => {
  it('accepts an object whose only key is a non-empty $fact string', () => {
    expect(isFieldReference({ $fact: 'address.city' })).toBe(true);
  });

  it('rejects malformed candidates', () => {
    expect(isFieldReference({ $fact: '' })).toBe(false);
    expect(isFieldReference({ $fact: 1 })).toBe(false);
    expect(isFieldReference({ $fact: 'x', other: 1 })).toBe(false);
    expect(isFieldReference({ other: 'x' })).toBe(false);
    expect(isFieldReference(['x'])).toBe(false);
    expect(isFieldReference('$fact')).toBe(false);
    expect(isFieldReference(null)).toBe(false);
    expect(isFieldReference(undefined)).toBe(false);
  });
});

describe('resolveValue', () => {
  const fact: Fact = {
    type: 'Test',
    attributes: {
      name: 'Ada',
      zip: null,
      zero: 0,
      address: { city: 'London' },
      tags: ['a', 'b'],
      rango: [1, 5],
    },
  };

  it('resolves top-level and nested references', () => {
    expect(resolveValue({ $fact: 'name' }, fact)).toBe('Ada');
    expect(resolveValue({ $fact: 'address.city' }, fact)).toBe('London');
    expect(resolveValue({ $fact: 'rango' }, fact)).toEqual([1, 5]);
  });

  it('returns undefined for an unresolvable or forbidden reference', () => {
    expect(resolveValue({ $fact: 'missing' }, fact)).toBeUndefined();
    expect(resolveValue({ $fact: 'address.country' }, fact)).toBeUndefined();
    expect(resolveValue({ $fact: '__proto__' }, fact)).toBeUndefined();
  });

  it('preserves explicit null and falsy field values', () => {
    expect(resolveValue({ $fact: 'zip' }, fact)).toBeNull();
    expect(resolveValue({ $fact: 'zero' }, fact)).toBe(0);
  });

  it('returns non-reference values unchanged', () => {
    expect(resolveValue(5, fact)).toBe(5);
    expect(resolveValue('x', fact)).toBe('x');
    expect(resolveValue(null, fact)).toBeNull();
  });

  it('resolves references in arrays and nested objects, materializing misses as null', () => {
    expect(resolveValue([{ $fact: 'name' }, { $fact: 'nope' }], fact)).toEqual(['Ada', null]);
    expect(resolveValue({ a: { $fact: 'name' }, b: [{ $fact: 'missing' }] }, fact)).toEqual({
      a: 'Ada',
      b: [null],
    });
  });

  it('does not treat a malformed $fact object as a reference', () => {
    expect(resolveValue({ $fact: '' }, fact)).toEqual({ $fact: '' });
  });
});
