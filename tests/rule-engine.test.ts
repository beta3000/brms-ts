import { describe, expect, it } from '@jest/globals';

import { CycleLimitExceededError, ValidationError } from '../src/engine/errors.js';
import { RuleEngine } from '../src/engine/rule-engine.js';
import { compare, defineRule } from '../src/model/rule.js';

describe('RuleEngine - end to end', () => {
  it('loads YAML rules, registers helpers, fires, and mutates facts', () => {
    const engine = new RuleEngine();
    const audited: string[] = [];
    engine.registerPredicate('isVip', (fact) => fact.attributes['tier'] === 'gold');
    engine.registerFunction('audit', (facts) => {
      const name = facts[0]?.attributes['name'];
      audited.push(typeof name === 'string' ? name : '');
    });
    engine.loadRules(`
rules:
  - name: vip-discount
    salience: 10
    noLoop: true
    when:
      kind: and
      conditions:
        - { kind: comparison, field: amount, operator: gte, value: 100 }
        - { kind: predicate, predicate: isVip }
    then:
      - { kind: modify, target: 0, attributes: { discount: 0.2 } }
      - { kind: invoke, function: audit }
`);
    const order = engine.insert({
      type: 'Order',
      attributes: { name: 'ord-1', amount: 150, tier: 'gold' },
    });
    const fired = engine.fireAllRules();
    expect(fired).toBe(1);
    expect(engine.getFacts()[0]?.attributes['discount']).toBe(0.2);
    expect(order.attributes['amount']).toBe(150);
    expect(audited).toEqual(['ord-1']);
  });

  it('accepts pre-built typed rules', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('count', () => {
      fired += 1;
    });
    engine.loadRules([
      defineRule({
        name: 'adult',
        when: compare('age', 'gte', 18),
        then: [{ kind: 'invoke', function: 'count' }],
      }),
    ]);
    engine.insert({ type: 'Person', attributes: { age: 30 } });
    engine.fireAllRules();
    expect(fired).toBe(1);
    expect(engine.getRules()).toHaveLength(1);
  });

  it('accepts a parsed object', () => {
    const engine = new RuleEngine();
    engine.loadRules({
      rules: [
        {
          name: 'flag',
          when: { kind: 'comparison', field: 'x', operator: 'eq', value: 1 },
          then: [{ kind: 'modify', target: 0, attributes: { flagged: true } }],
          noLoop: true,
        },
      ],
    });
    engine.insert({ type: 'T', attributes: { x: 1 } });
    engine.fireAllRules();
    expect(engine.getFacts()[0]?.attributes['flagged']).toBe(true);
  });

  it('reloading rules replaces the previous network without double firing', () => {
    const engine = new RuleEngine();
    let firstCalls = 0;
    let secondCalls = 0;
    engine.registerFunction('first', () => {
      firstCalls += 1;
    });
    engine.registerFunction('second', () => {
      secondCalls += 1;
    });
    engine.loadRules([
      defineRule({
        name: 'r1',
        when: compare('x', 'eq', 1),
        then: [{ kind: 'invoke', function: 'first' }],
      }),
    ]);
    // Reload with a different rule set before inserting facts.
    engine.loadRules([
      defineRule({
        name: 'r2',
        when: compare('x', 'eq', 1),
        then: [{ kind: 'invoke', function: 'second' }],
      }),
    ]);
    engine.insert({ type: 'T', attributes: { x: 1 } });
    engine.fireAllRules();
    expect(firstCalls).toBe(0);
    expect(secondCalls).toBe(1);
  });

  it('loading rules after inserting facts still matches them', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('count', () => {
      fired += 1;
    });
    engine.insert({ type: 'Person', attributes: { age: 40 } });
    engine.loadRules([
      defineRule({
        name: 'adult',
        when: compare('age', 'gte', 18),
        then: [{ kind: 'invoke', function: 'count' }],
      }),
    ]);
    engine.fireAllRules();
    expect(fired).toBe(1);
  });

  it('fireAllRules is a no-op before any rules are loaded', () => {
    const engine = new RuleEngine();
    engine.insert({ type: 'T', attributes: {} });
    expect(engine.fireAllRules()).toBe(0);
  });

  it('honours the configured cycle limit', () => {
    const engine = new RuleEngine({ cycleLimit: 25 });
    engine.loadRules([
      defineRule({
        name: 'loop',
        when: compare('kind', 'eq', 'loop'),
        then: [{ kind: 'insert', fact: { type: 'L', attributes: { kind: 'loop' } } }],
      }),
    ]);
    engine.insert({ type: 'L', attributes: { kind: 'loop' } });
    expect(() => engine.fireAllRules()).toThrow(CycleLimitExceededError);
  });

  it('supports modify and retract through the facade', () => {
    const engine = new RuleEngine();
    const record = engine.insert({ type: 'T', attributes: { x: 1 } });
    expect(engine.modify(record.id, { x: 2 })?.attributes['x']).toBe(2);
    expect(engine.retract(record.id)).toBe(true);
    expect(engine.getFacts()).toHaveLength(0);
  });

  it('rejects an array that does not contain typed rules', () => {
    const engine = new RuleEngine();
    // A non-empty array whose elements are not rules falls through to object
    // validation, which rejects it.
    expect(() => engine.loadRules(['not-a-rule'])).toThrow();
  });
});

describe('RuleEngine - fact type selectors', () => {
  it('activates typed rules only for facts of the selected type', () => {
    const engine = new RuleEngine();
    let orderFired = 0;
    let abFired = 0;
    let anyFired = 0;
    engine.registerFunction('markOrder', () => {
      orderFired += 1;
    });
    engine.registerFunction('markAb', () => {
      abFired += 1;
    });
    engine.registerFunction('markAny', () => {
      anyFired += 1;
    });
    engine.loadRules([
      defineRule({
        name: 'order-rule',
        type: 'Order',
        when: compare('age', 'gte', 18),
        then: [{ kind: 'invoke', function: 'markOrder' }],
      }),
      defineRule({
        name: 'ab-rule',
        type: ['X', 'Y'],
        when: compare('age', 'gte', 18),
        then: [{ kind: 'invoke', function: 'markAb' }],
      }),
      defineRule({
        name: 'any-rule',
        when: compare('age', 'gte', 18),
        then: [{ kind: 'invoke', function: 'markAny' }],
      }),
    ]);
    engine.insert({ type: 'Order', attributes: { age: 20 } });
    engine.insert({ type: 'Applicant', attributes: { age: 20 } });
    expect(engine.fireAllRules()).toBe(3);
    expect(orderFired).toBe(1);
    expect(abFired).toBe(0);
    expect(anyFired).toBe(2);
  });

  it('does not activate a typed rule when neither type nor condition match', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('mark', () => {
      fired += 1;
    });
    engine.loadRules([
      defineRule({
        name: 'order-rule',
        type: 'Order',
        when: compare('age', 'gte', 18),
        then: [{ kind: 'invoke', function: 'mark' }],
      }),
    ]);
    engine.insert({ type: 'Order', attributes: { age: 10 } });
    engine.insert({ type: 'Applicant', attributes: { age: 20 } });
    expect(engine.fireAllRules()).toBe(0);
    expect(fired).toBe(0);
  });

  it('applies a type selector loaded from YAML', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('mark', () => {
      fired += 1;
    });
    engine.loadRules(`
rules:
  - name: order-rule
    type: Order
    when: { kind: comparison, field: age, operator: gte, value: 18 }
    then:
      - { kind: invoke, function: mark }
`);
    engine.insert({ type: 'Applicant', attributes: { age: 20 } });
    engine.insert({ type: 'Order', attributes: { age: 20 } });
    expect(engine.fireAllRules()).toBe(1);
    expect(fired).toBe(1);
  });
});

describe('RuleEngine - $fact references end to end', () => {
  it('compares a field against another field of the bound fact (YAML)', () => {
    const engine = new RuleEngine();
    let calls = 0;
    engine.registerFunction('ok', () => {
      calls += 1;
    });
    engine.loadRules(`
rules:
  - name: within-limit
    when:
      kind: comparison
      field: discount
      operator: lte
      value: { $fact: maxDiscount }
    then:
      - { kind: invoke, function: ok }
`);
    engine.insert({ type: 'Quote', attributes: { discount: 0.1, maxDiscount: 0.2 } });
    expect(engine.fireAllRules()).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not fire when the referenced value fails the comparison', () => {
    const engine = new RuleEngine();
    engine.loadRules(`
rules:
  - name: within-limit
    when:
      kind: comparison
      field: discount
      operator: lte
      value: { $fact: maxDiscount }
    then:
      - { kind: invoke, function: ok }
`);
    engine.registerFunction('ok', () => {
      throw new Error('must not fire');
    });
    engine.insert({ type: 'Quote', attributes: { discount: 0.5, maxDiscount: 0.2 } });
    expect(engine.fireAllRules()).toBe(0);
  });

  it('inserts a derived fact from an attribute template', () => {
    const engine = new RuleEngine();
    engine.loadRules(`
rules:
  - name: audit-orders
    type: Order
    when: { kind: comparison, field: total, operator: gt, value: 0 }
    then:
      - { kind: insert, fact: { type: Audit, attributes: { order: { $fact: id } } } }
`);
    engine.insert({ type: 'Order', attributes: { id: 'a1', total: 10 } });
    engine.fireAllRules();
    const audit = engine.getFacts().find((fact) => fact.type === 'Audit');
    expect(audit?.attributes['order']).toBe('a1');
  });
});

describe('RuleEngine - regex guard end to end', () => {
  function loadMatches(value: unknown): void {
    new RuleEngine().loadRules({
      rules: [
        {
          name: 'r',
          when: { kind: 'comparison', field: 'code', operator: 'matches', value },
          then: [],
        },
      ],
    });
  }

  it('rejects a catastrophic pattern with a quantified-group detail', () => {
    try {
      loadMatches('(a+)+');
      throw new Error('expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.some((d) => d.includes('quantified'))).toBe(true);
    }
  });

  it('rejects a $fact reference as a matches pattern', () => {
    try {
      loadMatches({ $fact: 'p' });
      throw new Error('expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(
        (error as ValidationError).details.some((d) => d.includes('literal string pattern')),
      ).toBe(true);
    }
  });

  it('loads a safe pattern and fires', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('mark', () => {
      fired += 1;
    });
    engine.loadRules(`
rules:
  - name: code-shape
    when: { kind: comparison, field: code, operator: matches, value: '^[A-Z]{2}-\\d+$' }
    then:
      - { kind: invoke, function: mark }
`);
    engine.insert({ type: 'T', attributes: { code: 'AB-12' } });
    expect(engine.fireAllRules()).toBe(1);
    expect(fired).toBe(1);
  });
});

describe('RuleEngine - extended operators end to end', () => {
  it('fires between only for in-range values', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('hit', () => {
      fired += 1;
    });
    engine.loadRules(`
rules:
  - name: working-age
    when: { kind: comparison, field: age, operator: between, value: [18, 65] }
    then:
      - { kind: invoke, function: hit }
`);
    engine.insert({ type: 'Applicant', attributes: { age: 30 } });
    engine.insert({ type: 'Applicant', attributes: { age: 70 } });
    expect(engine.fireAllRules()).toBe(1);
    expect(fired).toBe(1);
  });

  it('fires isEmpty for a missing field', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('hit', () => {
      fired += 1;
    });
    engine.loadRules(`
rules:
  - name: missing-notes
    when: { kind: comparison, field: notes, operator: isEmpty }
    then:
      - { kind: invoke, function: hit }
`);
    engine.insert({ type: 'Order', attributes: {} });
    expect(engine.fireAllRules()).toBe(1);
    expect(fired).toBe(1);
  });

  it('fires exists for an empty string', () => {
    const engine = new RuleEngine();
    let fired = 0;
    engine.registerFunction('hit', () => {
      fired += 1;
    });
    engine.loadRules(`
rules:
  - name: notes-present
    when: { kind: comparison, field: notes, operator: exists }
    then:
      - { kind: invoke, function: hit }
`);
    engine.insert({ type: 'Order', attributes: { notes: '' } });
    expect(engine.fireAllRules()).toBe(1);
    expect(fired).toBe(1);
  });
});
