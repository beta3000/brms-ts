import { describe, expect, it } from '@jest/globals';

import {
  BrmsError,
  CycleLimitExceededError,
  UnknownReferenceError,
  ValidationError,
} from '../../src/engine/errors.js';

describe('error classes', () => {
  it('BrmsError sets its name and is an Error', () => {
    const err = new BrmsError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BrmsError');
    expect(err.message).toBe('boom');
  });

  it('UnknownReferenceError describes the missing predicate/function', () => {
    const err = new UnknownReferenceError('predicate', 'isVip');
    expect(err).toBeInstanceOf(BrmsError);
    expect(err.name).toBe('UnknownReferenceError');
    expect(err.message).toContain('predicate');
    expect(err.message).toContain('isVip');
  });

  it('ValidationError carries details and defaults to an empty list', () => {
    const withDetails = new ValidationError('invalid', ['a missing', 'b wrong']);
    expect(withDetails.details).toEqual(['a missing', 'b wrong']);

    const withoutDetails = new ValidationError('invalid');
    expect(withoutDetails.details).toEqual([]);
  });

  it('CycleLimitExceededError mentions the limit', () => {
    const err = new CycleLimitExceededError(1000);
    expect(err).toBeInstanceOf(BrmsError);
    expect(err.message).toContain('1000');
  });
});
