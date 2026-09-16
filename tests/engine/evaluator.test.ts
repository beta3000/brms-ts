import { describe, expect, it } from '@jest/globals';

import { evaluateCondition } from '../../src/engine/evaluator.js';
import { UnknownReferenceError } from '../../src/engine/errors.js';
import { FunctionRegistry } from '../../src/engine/function-registry.js';
import { and, compare, not, or, predicate } from '../../src/model/rule.js';
import type { ComparisonOperator } from '../../src/model/condition.js';
import type { Fact, FactValue } from '../../src/model/fact.js';

function makeFact(attributes: Record<string, FactValue>): Fact {
  return { type: 'Test', attributes };
}

const registry = new FunctionRegistry();

describe('evaluateCondition - comparison operators', () => {
  const cases: readonly {
    readonly op: ComparisonOperator;
    readonly field: string;
    readonly value: FactValue;
    readonly attrs: Record<string, FactValue>;
    readonly expected: boolean;
  }[] = [
    { op: 'eq', field: 'a', value: 1, attrs: { a: 1 }, expected: true },
    { op: 'eq', field: 'a', value: 1, attrs: { a: 2 }, expected: false },
    { op: 'neq', field: 'a', value: 1, attrs: { a: 2 }, expected: true },
    { op: 'gt', field: 'a', value: 1, attrs: { a: 2 }, expected: true },
    { op: 'gt', field: 'a', value: 2, attrs: { a: 2 }, expected: false },
    { op: 'gte', field: 'a', value: 2, attrs: { a: 2 }, expected: true },
    { op: 'lt', field: 'a', value: 2, attrs: { a: 1 }, expected: true },
    { op: 'lte', field: 'a', value: 2, attrs: { a: 2 }, expected: true },
    { op: 'gt', field: 's', value: 'a', attrs: { s: 'b' }, expected: true },
    { op: 'lt', field: 's', value: 'b', attrs: { s: 'a' }, expected: true },
    { op: 'in', field: 'a', value: [1, 2, 3], attrs: { a: 2 }, expected: true },
    { op: 'in', field: 'a', value: [1, 2, 3], attrs: { a: 9 }, expected: false },
    { op: 'contains', field: 's', value: 'ell', attrs: { s: 'hello' }, expected: true },
    { op: 'contains', field: 'arr', value: 3, attrs: { arr: [1, 2, 3] }, expected: true },
    { op: 'eq', field: 'arr', value: [1, 2], attrs: { arr: [1, 2] }, expected: true },
    { op: 'eq', field: 'arr', value: [1, 2], attrs: { arr: [1, 3] }, expected: false },
  ];

  it.each(cases)('$op on $field -> $expected', ({ op, field, value, attrs, expected }) => {
    expect(evaluateCondition(compare(field, op, value), makeFact(attrs), registry)).toBe(expected);
  });

  it('ordering against a missing or incompatible value is false', () => {
    expect(evaluateCondition(compare('missing', 'gt', 1), makeFact({}), registry)).toBe(false);
    expect(evaluateCondition(compare('s', 'gt', 1), makeFact({ s: 'x' }), registry)).toBe(false);
  });

  it('in/contains against non-arrays is false', () => {
    expect(evaluateCondition(compare('a', 'in', 5), makeFact({ a: 5 }), registry)).toBe(false);
    expect(evaluateCondition(compare('a', 'contains', 5), makeFact({ a: 5 }), registry)).toBe(
      false,
    );
  });
});

describe('evaluateCondition - logical combinators', () => {
  const fact = makeFact({ age: 30, country: 'PE' });

  it('and requires all sub-conditions', () => {
    const cond = and(compare('age', 'gte', 18), compare('country', 'eq', 'PE'));
    expect(evaluateCondition(cond, fact, registry)).toBe(true);
    const cond2 = and(compare('age', 'gte', 18), compare('country', 'eq', 'US'));
    expect(evaluateCondition(cond2, fact, registry)).toBe(false);
  });

  it('or requires at least one sub-condition', () => {
    const cond = or(compare('age', 'gt', 100), compare('country', 'eq', 'PE'));
    expect(evaluateCondition(cond, fact, registry)).toBe(true);
  });

  it('not negates', () => {
    expect(evaluateCondition(not(compare('age', 'gt', 100)), fact, registry)).toBe(true);
  });

  it('supports deep nesting', () => {
    const cond = and(
      compare('age', 'gte', 18),
      or(compare('country', 'eq', 'US'), not(compare('country', 'eq', 'AR'))),
    );
    expect(evaluateCondition(cond, fact, registry)).toBe(true);
  });
});

describe('evaluateCondition - custom predicates', () => {
  it('invokes a registered predicate with args', () => {
    const reg = new FunctionRegistry();
    reg.registerPredicate('between', (fact, args) => {
      const value = fact.attributes['n'];
      const [min, max] = args;
      return (
        typeof value === 'number' &&
        typeof min === 'number' &&
        typeof max === 'number' &&
        value >= min &&
        value <= max
      );
    });
    expect(evaluateCondition(predicate('between', 1, 10), makeFact({ n: 5 }), reg)).toBe(true);
    expect(evaluateCondition(predicate('between', 1, 10), makeFact({ n: 50 }), reg)).toBe(false);
  });

  it('throws when the predicate is not registered', () => {
    expect(() =>
      evaluateCondition(predicate('ghost'), makeFact({}), new FunctionRegistry()),
    ).toThrow(UnknownReferenceError);
  });
});
