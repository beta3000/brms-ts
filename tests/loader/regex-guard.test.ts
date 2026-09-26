import { describe, expect, it } from '@jest/globals';

import { validateRegexPattern } from '../../src/loader/regex-guard.js';

describe('validateRegexPattern', () => {
  const nestedQuantifierPatterns = [
    '(a+)+',
    '(a*)*',
    '([a-zA-Z]+)*',
    '(\\d{2,})+',
    '((a+))+',
    '(x|y+)*',
    '(a+){2}',
  ];

  it.each(nestedQuantifierPatterns)('rejects the nested quantifier in %s', (pattern) => {
    expect(validateRegexPattern(pattern)).toBe(
      'pattern contains a quantified group with an inner quantifier (catastrophic backtracking risk)',
    );
  });

  it('rejects an empty pattern', () => {
    expect(validateRegexPattern('')).toBe('pattern must be a non-empty string');
  });

  it('rejects a pattern longer than 256 characters', () => {
    expect(validateRegexPattern('a'.repeat(257))).toBe('pattern exceeds the 256-character limit');
  });

  it('rejects a pattern that does not compile', () => {
    expect(validateRegexPattern('[')).toContain('pattern is not a valid regular expression');
  });

  const acceptedPatterns = [
    '^[A-Z]{2}-\\d+$',
    '^https?://',
    'a+b+',
    '(abc)+',
    '(ab|cd)+',
    '^.{1,10}$',
    '^a{2}$',
    '^a(b?c)*$',
    '\\(\\w+\\)+',
    '(a+)?',
    '(a+){1}',
    '(a{x})+',
    'a'.repeat(256),
  ];

  it.each(acceptedPatterns)('accepts %s', (pattern) => {
    expect(validateRegexPattern(pattern)).toBeUndefined();
  });
});
