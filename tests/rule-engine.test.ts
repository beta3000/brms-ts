import { describe, expect, it } from '@jest/globals';

import { CycleLimitExceededError } from '../src/engine/errors.js';
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
