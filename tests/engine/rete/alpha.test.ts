import { describe, expect, it } from '@jest/globals';

import { AlphaNode } from '../../../src/engine/rete/alpha.js';
import { FunctionRegistry } from '../../../src/engine/function-registry.js';
import { and, compare } from '../../../src/model/rule.js';
import type { FactRecord } from '../../../src/model/fact.js';

const registry = new FunctionRegistry();

function record(id: string, age: number): FactRecord {
  return { id, type: 'Customer', attributes: { age } };
}

describe('AlphaNode', () => {
  it('adds a matching fact to the memory on insert', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    expect(node.insert(record('f0', 20))).toBe('added');
    expect(node.has('f0')).toBe(true);
    expect(node.size).toBe(1);
  });

  it('ignores a non-matching fact on insert', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    expect(node.insert(record('f0', 10))).toBe('unchanged');
    expect(node.has('f0')).toBe(false);
    expect(node.size).toBe(0);
  });

  it('modify adds when a fact starts matching', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 10));
    expect(node.modify(record('f0', 30))).toBe('added');
    expect(node.has('f0')).toBe(true);
  });

  it('modify removes when a fact stops matching', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 30));
    expect(node.modify(record('f0', 10))).toBe('removed');
    expect(node.has('f0')).toBe(false);
  });

  it('modify retains when a fact keeps matching', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 30));
    expect(node.modify(record('f0', 40))).toBe('retained');
  });

  it('modify is unchanged when a fact keeps not matching', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 10));
    expect(node.modify(record('f0', 12))).toBe('unchanged');
  });

  it('retract removes a present fact', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 30));
    expect(node.retract('f0')).toBe('removed');
    expect(node.has('f0')).toBe(false);
  });

  it('retract is unchanged for an absent fact', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    expect(node.retract('f0')).toBe('unchanged');
  });

  it('matches returns a snapshot of matching facts', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 20));
    node.insert(record('f1', 25));
    node.insert(record('f2', 5));
    const ids = node.matches().map((f) => f.id);
    expect(ids.sort()).toEqual(['f0', 'f1']);
  });

  it('works with composite conditions', () => {
    const node = new AlphaNode(and(compare('age', 'gte', 18), compare('age', 'lt', 65)), registry);
    node.insert(record('f0', 30));
    node.insert(record('f1', 70));
    expect(node.has('f0')).toBe(true);
    expect(node.has('f1')).toBe(false);
  });

  it('clear empties the memory', () => {
    const node = new AlphaNode(compare('age', 'gte', 18), registry);
    node.insert(record('f0', 20));
    node.clear();
    expect(node.size).toBe(0);
  });
});
