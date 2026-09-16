import { describe, expect, it } from '@jest/globals';

import { CycleLimitExceededError } from '../../src/engine/errors.js';
import { FunctionRegistry } from '../../src/engine/function-registry.js';
import { ReteNetwork } from '../../src/engine/network.js';
import { WorkingMemory } from '../../src/engine/working-memory.js';
import { compare, defineRule } from '../../src/model/rule.js';
import type { Rule } from '../../src/model/rule.js';

interface Harness {
  readonly wm: WorkingMemory;
  readonly network: ReteNetwork;
  readonly registry: FunctionRegistry;
}

/**
 * Reads a fact attribute as a string, or returns an empty string. Narrowing
 * here keeps type-aware lint rules from recursing on the recursive FactValue
 * type when a value is stringified.
 */
function attrString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function setup(rules: readonly Rule[], registry = new FunctionRegistry()): Harness {
  const wm = new WorkingMemory();
  const network = new ReteNetwork(wm, registry, rules);
  return { wm, network, registry };
}

describe('ReteNetwork - firing', () => {
  it('fires a rule whose condition a fact satisfies', () => {
    const registry = new FunctionRegistry();
    const seen: string[] = [];
    registry.registerFunction('mark', (facts) => {
      const first = facts[0];
      if (first) {
        seen.push(attrString(first.attributes['name']));
      }
    });
    const rule = defineRule({
      name: 'adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'invoke', function: 'mark' }],
    });
    const { wm, network } = setup([rule], registry);
    wm.insert({ type: 'Customer', attributes: { name: 'Ada', age: 30 } });
    expect(network.fireAllRules()).toBe(1);
    expect(seen).toEqual(['Ada']);
  });

  it('does not fire for a non-matching fact', () => {
    const rule = defineRule({
      name: 'adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'modify', target: 0, attributes: { adult: true } }],
    });
    const { wm, network } = setup([rule]);
    wm.insert({ type: 'Customer', attributes: { age: 10 } });
    expect(network.fireAllRules()).toBe(0);
  });

  it('applies a modify action to the matched fact', () => {
    const rule = defineRule({
      name: 'flag-adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'modify', target: 0, attributes: { adult: true } }],
      noLoop: true,
    });
    const { wm, network } = setup([rule]);
    const record = wm.insert({ type: 'Customer', attributes: { age: 30 } });
    network.fireAllRules();
    expect(wm.get(record.id)?.attributes['adult']).toBe(true);
  });

  it('supports forward chaining between rules', () => {
    const ruleA = defineRule({
      name: 'a-inserts-b',
      when: compare('kind', 'eq', 'A'),
      then: [{ kind: 'insert', fact: { type: 'B', attributes: { kind: 'B' } } }],
      noLoop: true,
    });
    const log: string[] = [];
    const registry = new FunctionRegistry();
    registry.registerFunction('log', (facts) => {
      log.push(attrString(facts[0]?.attributes['kind']));
    });
    const ruleB = defineRule({
      name: 'b-logs',
      when: compare('kind', 'eq', 'B'),
      then: [{ kind: 'invoke', function: 'log' }],
    });
    const { wm, network } = setup([ruleA, ruleB], registry);
    wm.insert({ type: 'A', attributes: { kind: 'A' } });
    const fired = network.fireAllRules();
    expect(fired).toBe(2);
    expect(log).toEqual(['B']);
  });

  it('retract removes a pending activation before it fires', () => {
    const rule = defineRule({
      name: 'adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'invoke', function: 'noop' }],
    });
    const registry = new FunctionRegistry();
    let calls = 0;
    registry.registerFunction('noop', () => {
      calls += 1;
    });
    const { wm, network } = setup([rule], registry);
    const record = wm.insert({ type: 'Customer', attributes: { age: 30 } });
    wm.retract(record.id);
    expect(network.fireAllRules()).toBe(0);
    expect(calls).toBe(0);
  });
});

describe('ReteNetwork - conflict resolution', () => {
  it('fires higher-salience rules first', () => {
    const order: string[] = [];
    const registry = new FunctionRegistry();
    registry.registerFunction('recordLow', () => order.push('low'));
    registry.registerFunction('recordHigh', () => order.push('high'));
    const low = defineRule({
      name: 'low',
      salience: 1,
      when: compare('x', 'eq', 1),
      then: [{ kind: 'invoke', function: 'recordLow' }],
    });
    const high = defineRule({
      name: 'high',
      salience: 10,
      when: compare('x', 'eq', 1),
      then: [{ kind: 'invoke', function: 'recordHigh' }],
    });
    const { wm, network } = setup([low, high], registry);
    wm.insert({ type: 'T', attributes: { x: 1 } });
    network.fireAllRules();
    expect(order).toEqual(['high', 'low']);
  });
});

describe('ReteNetwork - loop safety', () => {
  it('no-loop prevents a self-modifying rule from looping', () => {
    const rule = defineRule({
      name: 'increment-once',
      noLoop: true,
      when: compare('n', 'gte', 0),
      then: [{ kind: 'modify', target: 0, attributes: { touched: true } }],
    });
    const { wm, network } = setup([rule]);
    wm.insert({ type: 'Counter', attributes: { n: 0 } });
    expect(() => network.fireAllRules()).not.toThrow();
  });

  it('throws CycleLimitExceededError on a runaway loop', () => {
    // Without no-loop, a rule that keeps inserting a new matching fact loops.
    const rule = defineRule({
      name: 'loop',
      when: compare('kind', 'eq', 'loop'),
      then: [{ kind: 'insert', fact: { type: 'L', attributes: { kind: 'loop' } } }],
    });
    const wm = new WorkingMemory();
    const network = new ReteNetwork(wm, new FunctionRegistry(), [rule], { cycleLimit: 50 });
    wm.insert({ type: 'L', attributes: { kind: 'loop' } });
    expect(() => network.fireAllRules()).toThrow(CycleLimitExceededError);
  });

  it('seeds pre-existing facts on construction', () => {
    const wm = new WorkingMemory();
    wm.insert({ type: 'Customer', attributes: { age: 30 } });
    const registry = new FunctionRegistry();
    let fired = 0;
    registry.registerFunction('count', () => {
      fired += 1;
    });
    const rule = defineRule({
      name: 'adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'invoke', function: 'count' }],
    });
    const network = new ReteNetwork(wm, registry, [rule]);
    network.fireAllRules();
    expect(fired).toBe(1);
  });

  it('exposes the number of pending activations', () => {
    const rule = defineRule({
      name: 'adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'invoke', function: 'noop' }],
    });
    const registry = new FunctionRegistry().registerFunction('noop', () => undefined);
    const { wm, network } = setup([rule], registry);
    expect(network.pendingActivations).toBe(0);
    wm.insert({ type: 'Customer', attributes: { age: 30 } });
    expect(network.pendingActivations).toBe(1);
  });

  it('removes a pending activation when a modify breaks the match', () => {
    const rule = defineRule({
      name: 'adult',
      when: compare('age', 'gte', 18),
      then: [{ kind: 'invoke', function: 'noop' }],
    });
    const registry = new FunctionRegistry().registerFunction('noop', () => undefined);
    const { wm, network } = setup([rule], registry);
    const record = wm.insert({ type: 'Customer', attributes: { age: 30 } });
    expect(network.pendingActivations).toBe(1);
    wm.modify(record.id, { age: 10 });
    expect(network.pendingActivations).toBe(0);
    expect(network.fireAllRules()).toBe(0);
  });

  it('no-loop suppresses re-activation from the firing rule own modify', () => {
    // The rule keeps matching after modifying its own fact; no-loop must stop it.
    const rule = defineRule({
      name: 'self-modify',
      noLoop: true,
      when: compare('n', 'gte', 0),
      then: [{ kind: 'modify', target: 0, attributes: { seen: true } }],
    });
    const { wm, network } = setup([rule]);
    const record = wm.insert({ type: 'Counter', attributes: { n: 5 } });
    expect(network.fireAllRules()).toBe(1);
    expect(wm.get(record.id)?.attributes['seen']).toBe(true);
  });

  it('no-loop suppresses activations the firing rule creates for itself', () => {
    // A no-loop rule that inserts another fact its own pattern matches must not
    // re-activate itself for that new fact while it is firing.
    const rule = defineRule({
      name: 'spawner',
      noLoop: true,
      when: compare('kind', 'eq', 'seed'),
      then: [{ kind: 'insert', fact: { type: 'S', attributes: { kind: 'seed' } } }],
    });
    const { wm, network } = setup([rule]);
    wm.insert({ type: 'S', attributes: { kind: 'seed' } });
    // Only the original activation fires; the self-spawned one is suppressed.
    expect(network.fireAllRules()).toBe(1);
  });
});
