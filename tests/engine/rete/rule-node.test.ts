import { describe, expect, it } from '@jest/globals';

import { FunctionRegistry } from '../../../src/engine/function-registry.js';
import { RuleNode } from '../../../src/engine/rete/rule-node.js';
import { compare, defineRule } from '../../../src/model/rule.js';
import type { FactRecord } from '../../../src/model/fact.js';

const registry = new FunctionRegistry();

const rule = defineRule({
  name: 'adult',
  when: compare('age', 'gte', 18),
  then: [],
});

function record(id: string, age: number): FactRecord {
  return { id, type: 'Customer', attributes: { age } };
}

describe('RuleNode', () => {
  it('exposes its rule', () => {
    const node = new RuleNode(rule, registry);
    expect(node.rule.name).toBe('adult');
  });

  it('creates an activation for a matching inserted fact', () => {
    const node = new RuleNode(rule, registry);
    const delta = node.insert(record('f0', 20));
    expect(delta.added).toHaveLength(1);
    expect(delta.removed).toHaveLength(0);
    expect(delta.added[0]?.rule.name).toBe('adult');
    expect(delta.added[0]?.fact.id).toBe('f0');
    expect(node.activations()).toHaveLength(1);
  });

  it('does not activate for a non-matching inserted fact', () => {
    const node = new RuleNode(rule, registry);
    const delta = node.insert(record('f0', 10));
    expect(delta.added).toHaveLength(0);
    expect(node.activations()).toHaveLength(0);
  });

  it('removes the activation when a retract occurs', () => {
    const node = new RuleNode(rule, registry);
    node.insert(record('f0', 20));
    const delta = node.retract('f0');
    expect(delta.removed).toHaveLength(1);
    expect(delta.removed[0]?.fact.id).toBe('f0');
    expect(node.activations()).toHaveLength(0);
  });

  it('retract of an unknown fact yields an empty delta', () => {
    const node = new RuleNode(rule, registry);
    const delta = node.retract('missing');
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('modify that starts matching adds an activation', () => {
    const node = new RuleNode(rule, registry);
    node.insert(record('f0', 10));
    const delta = node.modify(record('f0', 30));
    expect(delta.added).toHaveLength(1);
  });

  it('modify that stops matching removes the activation', () => {
    const node = new RuleNode(rule, registry);
    node.insert(record('f0', 30));
    const delta = node.modify(record('f0', 10));
    expect(delta.removed).toHaveLength(1);
    expect(node.activations()).toHaveLength(0);
  });

  it('modify that keeps matching refreshes without a new agenda entry', () => {
    const node = new RuleNode(rule, registry);
    node.insert(record('f0', 30));
    const delta = node.modify(record('f0', 40));
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    // The bound fact should now reflect the updated attributes.
    expect(node.activations()[0]?.fact.attributes['age']).toBe(40);
  });

  it('modify of a never-matching fact yields an empty delta', () => {
    const node = new RuleNode(rule, registry);
    node.insert(record('f0', 5));
    const delta = node.modify(record('f0', 8));
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it('produces one activation per matching fact', () => {
    const node = new RuleNode(rule, registry);
    node.insert(record('f0', 20));
    node.insert(record('f1', 25));
    node.insert(record('f2', 5));
    expect(node.activations()).toHaveLength(2);
  });

  it('activation ids are unique per rule/fact pair', () => {
    const node = new RuleNode(rule, registry);
    const a = node.insert(record('f0', 20)).added[0];
    const b = node.insert(record('f1', 20)).added[0];
    expect(a?.id).not.toBe(b?.id);
  });
});
