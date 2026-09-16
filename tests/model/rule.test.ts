import { describe, expect, it } from '@jest/globals';

import {
  and,
  compare,
  defineRule,
  DEFAULT_SALIENCE,
  not,
  or,
  predicate,
} from '../../src/model/index.js';

describe('condition factories', () => {
  it('compare builds a comparison condition', () => {
    expect(compare('age', 'gte', 18)).toEqual({
      kind: 'comparison',
      field: 'age',
      operator: 'gte',
      value: 18,
    });
  });

  it('predicate without args omits the args field', () => {
    expect(predicate('isVip')).toEqual({ kind: 'predicate', predicate: 'isVip' });
  });

  it('predicate with args includes them', () => {
    expect(predicate('within', 10, 20)).toEqual({
      kind: 'predicate',
      predicate: 'within',
      args: [10, 20],
    });
  });

  it('and/or wrap sub-conditions', () => {
    const a = compare('a', 'eq', 1);
    const b = compare('b', 'eq', 2);
    expect(and(a, b)).toEqual({ kind: 'and', conditions: [a, b] });
    expect(or(a, b)).toEqual({ kind: 'or', conditions: [a, b] });
  });

  it('not wraps a single condition', () => {
    const a = compare('a', 'eq', 1);
    expect(not(a)).toEqual({ kind: 'not', condition: a });
  });
});

describe('defineRule', () => {
  it('applies default salience and noLoop', () => {
    const rule = defineRule({
      name: 'r1',
      when: compare('x', 'eq', 1),
      then: [],
    });
    expect(rule.salience).toBe(DEFAULT_SALIENCE);
    expect(rule.noLoop).toBe(false);
    expect(rule.name).toBe('r1');
  });

  it('preserves explicit salience and noLoop', () => {
    const rule = defineRule({
      name: 'r2',
      salience: 100,
      noLoop: true,
      when: compare('x', 'eq', 1),
      then: [{ kind: 'invoke', function: 'log' }],
    });
    expect(rule.salience).toBe(100);
    expect(rule.noLoop).toBe(true);
    expect(rule.then).toHaveLength(1);
  });

  it('allows salience of zero explicitly', () => {
    const rule = defineRule({
      name: 'r3',
      salience: 0,
      when: compare('x', 'eq', 1),
      then: [],
    });
    expect(rule.salience).toBe(0);
  });
});
