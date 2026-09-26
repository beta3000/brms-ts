import { describe, expect, it } from '@jest/globals';

import { evaluateCondition } from '../../src/engine/evaluator.js';
import { UnknownReferenceError } from '../../src/engine/errors.js';
import { FunctionRegistry } from '../../src/engine/function-registry.js';
import { and, compare, not, or, predicate } from '../../src/model/rule.js';
import type {
  BinaryComparisonOperator,
  ComparisonOperator,
  UnaryComparisonOperator,
} from '../../src/model/condition.js';
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

describe('evaluateCondition - extended comparison operators', () => {
  const cases: readonly {
    readonly op: BinaryComparisonOperator;
    readonly field: string;
    readonly value: FactValue;
    readonly attrs: Record<string, FactValue>;
    readonly expected: boolean;
  }[] = [
    { op: 'between', field: 'a', value: [18, 65], attrs: { a: 30 }, expected: true },
    { op: 'between', field: 'a', value: [18, 65], attrs: { a: 18 }, expected: true },
    { op: 'between', field: 'a', value: [18, 65], attrs: { a: 65 }, expected: true },
    { op: 'between', field: 'a', value: [18, 65], attrs: { a: 17 }, expected: false },
    { op: 'between', field: 'a', value: [18, 65], attrs: { a: 66 }, expected: false },
    { op: 'between', field: 's', value: ['a', 'z'], attrs: { s: 'm' }, expected: true },
    { op: 'between', field: 's', value: ['a', 'z'], attrs: { s: 'A' }, expected: false },
    { op: 'between', field: 'a', value: ['a', 'z'], attrs: { a: 1 }, expected: false },
    { op: 'between', field: 'a', value: [1], attrs: { a: 1 }, expected: false },
    { op: 'between', field: 'a', value: [1, 2, 3], attrs: { a: 2 }, expected: false },
    { op: 'between', field: 'a', value: 5, attrs: { a: 5 }, expected: false },
    { op: 'between', field: 'a', value: {}, attrs: { a: 5 }, expected: false },
    { op: 'startsWith', field: 's', value: 'ab', attrs: { s: 'abc' }, expected: true },
    { op: 'startsWith', field: 's', value: 'bc', attrs: { s: 'abc' }, expected: false },
    { op: 'startsWith', field: 'n', value: '5', attrs: { n: 5 }, expected: false },
    { op: 'endsWith', field: 's', value: 'bc', attrs: { s: 'abc' }, expected: true },
    { op: 'endsWith', field: 's', value: 'ab', attrs: { s: 'abc' }, expected: false },
    { op: 'endsWith', field: 'a', value: 'c', attrs: { a: ['a', 'b'] }, expected: false },
    { op: 'matches', field: 's', value: '^[A-Z]{2}-\\d+$', attrs: { s: 'AB-12' }, expected: true },
    { op: 'matches', field: 's', value: '^[A-Z]{2}-\\d+$', attrs: { s: 'ab-1' }, expected: false },
    { op: 'matches', field: 'n', value: '\\d+', attrs: { n: 5 }, expected: false },
  ];

  it.each(cases)('$op on $field -> $expected', ({ op, field, value, attrs, expected }) => {
    expect(evaluateCondition(compare(field, op, value), makeFact(attrs), registry)).toBe(expected);
  });

  it('between accepts a $fact range reference', () => {
    const condition = compare('a', 'between', { $fact: 'rango' });
    expect(evaluateCondition(condition, makeFact({ a: 3, rango: [1, 5] }), registry)).toBe(true);
    expect(evaluateCondition(condition, makeFact({ a: 9, rango: [1, 5] }), registry)).toBe(false);
  });

  it('matches with an invalid programmatic pattern is false and does not throw', () => {
    expect(evaluateCondition(compare('s', 'matches', '['), makeFact({ s: 'x' }), registry)).toBe(
      false,
    );
  });

  it('keeps matching after the compiled-pattern cache evicts entries', () => {
    const condition = compare('s', 'matches', '^victim$');
    expect(evaluateCondition(condition, makeFact({ s: 'victim' }), registry)).toBe(true);
    // Overflow the 256-entry cache so the entry above is evicted.
    for (let i = 0; i < 300; i += 1) {
      const value = `v${String(i)}`;
      expect(
        evaluateCondition(compare('s', 'matches', `^${value}$`), makeFact({ s: value }), registry),
      ).toBe(true);
    }
    expect(evaluateCondition(condition, makeFact({ s: 'victim' }), registry)).toBe(true);
  });
});

describe('evaluateCondition - unary operators', () => {
  const cases: readonly {
    readonly op: UnaryComparisonOperator;
    readonly field: string;
    readonly attrs: Record<string, FactValue>;
    readonly expected: boolean;
  }[] = [
    { op: 'isEmpty', field: 'missing', attrs: {}, expected: true },
    { op: 'isEmpty', field: 'v', attrs: { v: null }, expected: true },
    { op: 'isEmpty', field: 'v', attrs: { v: '' }, expected: true },
    { op: 'isEmpty', field: 'v', attrs: { v: [] }, expected: true },
    { op: 'isEmpty', field: 'v', attrs: { v: {} }, expected: true },
    { op: 'isEmpty', field: 'v', attrs: { v: 0 }, expected: false },
    { op: 'isEmpty', field: 'v', attrs: { v: false }, expected: false },
    { op: 'isEmpty', field: 'v', attrs: { v: 'x' }, expected: false },
    { op: 'isEmpty', field: 'v', attrs: { v: [1] }, expected: false },
    { op: 'isEmpty', field: 'v', attrs: { v: { a: 1 } }, expected: false },
    { op: 'exists', field: 'v', attrs: { v: 0 }, expected: true },
    { op: 'exists', field: 'v', attrs: { v: false }, expected: true },
    { op: 'exists', field: 'v', attrs: { v: '' }, expected: true },
    { op: 'exists', field: 'missing', attrs: {}, expected: false },
    { op: 'exists', field: 'v', attrs: { v: null }, expected: false },
  ];

  it.each(cases)('$op on $field -> $expected', ({ op, field, attrs, expected }) => {
    expect(evaluateCondition(compare(field, op), makeFact(attrs), registry)).toBe(expected);
  });

  it('ignores a stray value on a unary operator', () => {
    const condition = { ...compare('a', 'isEmpty'), value: 1 };
    expect(evaluateCondition(condition, makeFact({ a: 1 }), registry)).toBe(false);
  });
});

describe('evaluateCondition - $fact references', () => {
  it('resolves a comparison value against another field of the bound fact', () => {
    const condition = compare('discount', 'lte', { $fact: 'max' });
    expect(evaluateCondition(condition, makeFact({ discount: 0.1, max: 0.2 }), registry)).toBe(
      true,
    );
    expect(evaluateCondition(condition, makeFact({ discount: 0.5, max: 0.2 }), registry)).toBe(
      false,
    );
  });

  it('an unresolvable reference behaves like a missing field', () => {
    const condition = compare('discount', 'eq', { $fact: 'ghost' });
    expect(evaluateCondition(condition, makeFact({ discount: 0.1 }), registry)).toBe(false);
  });

  it('binary operators with no value are false, including neq', () => {
    expect(evaluateCondition(compare('a', 'eq'), makeFact({ a: 1 }), registry)).toBe(false);
    expect(evaluateCondition(compare('a', 'neq'), makeFact({ a: 1 }), registry)).toBe(false);
    expect(evaluateCondition(compare('a', 'neq'), makeFact({}), registry)).toBe(false);
  });
});

describe('evaluateCondition - value semantics', () => {
  it('never coerces between numbers and strings', () => {
    expect(evaluateCondition(compare('a', 'eq', '1'), makeFact({ a: 1 }), registry)).toBe(false);
    expect(evaluateCondition(compare('a', 'eq', 1), makeFact({ a: '1' }), registry)).toBe(false);
  });

  it('distinguishes a missing field from null, while neq matches the absent field', () => {
    expect(evaluateCondition(compare('a', 'eq', null), makeFact({}), registry)).toBe(false);
    expect(evaluateCondition(compare('a', 'neq', 1), makeFact({}), registry)).toBe(true);
  });

  it('orders only number-to-number and string-to-string', () => {
    expect(evaluateCondition(compare('a', 'gt', '1'), makeFact({ a: 2 }), registry)).toBe(false);
    expect(evaluateCondition(compare('a', 'lte', 2), makeFact({ a: 'x' }), registry)).toBe(false);
  });

  it('in uses strict equality; contains is substring or membership', () => {
    expect(evaluateCondition(compare('a', 'in', [1, 2]), makeFact({ a: 2 }), registry)).toBe(true);
    expect(evaluateCondition(compare('a', 'in', ['2']), makeFact({ a: 2 }), registry)).toBe(false);
    expect(
      evaluateCondition(compare('s', 'contains', 'll'), makeFact({ s: 'hello' }), registry),
    ).toBe(true);
    expect(evaluateCondition(compare('arr', 'contains', 2), makeFact({ arr: [2] }), registry)).toBe(
      true,
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

  it('resolves $fact references in predicate args', () => {
    const reg = new FunctionRegistry();
    let received: readonly FactValue[] = [];
    reg.registerPredicate('capture', (_fact, args) => {
      received = args;
      return true;
    });
    evaluateCondition(predicate('capture', { $fact: 'n' }, 'literal'), makeFact({ n: 5 }), reg);
    expect(received).toEqual([5, 'literal']);
  });

  it('throws when the predicate is not registered', () => {
    expect(() =>
      evaluateCondition(predicate('ghost'), makeFact({}), new FunctionRegistry()),
    ).toThrow(UnknownReferenceError);
  });
});
