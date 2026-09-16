import { describe, expect, it } from '@jest/globals';

import { readFieldPath } from '../../src/engine/field-access.js';

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
