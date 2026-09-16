import { describe, expect, it } from '@jest/globals';

import { executeActions } from '../../src/engine/executor.js';
import { FunctionRegistry } from '../../src/engine/function-registry.js';
import { WorkingMemory } from '../../src/engine/working-memory.js';
import type { Action } from '../../src/model/action.js';
import type { FactRecord, FactValue } from '../../src/model/fact.js';

function bound(wm: WorkingMemory, attrs: Record<string, FactValue>): FactRecord {
  return wm.insert({ type: 'T', attributes: attrs });
}

describe('executeActions', () => {
  it('insert adds a new fact to the working memory', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 1 });
    const actions: Action[] = [{ kind: 'insert', fact: { type: 'New', attributes: { y: 2 } } }];
    executeActions(actions, record, wm, new FunctionRegistry());
    expect(wm.getAll().some((f) => f.type === 'New')).toBe(true);
  });

  it('modify with target 0 updates the bound fact', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 1 });
    executeActions(
      [{ kind: 'modify', target: 0, attributes: { x: 99 } }],
      record,
      wm,
      new FunctionRegistry(),
    );
    expect(wm.get(record.id)?.attributes['x']).toBe(99);
  });

  it('modify with a non-zero target is a no-op', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 1 });
    executeActions(
      [{ kind: 'modify', target: 1, attributes: { x: 99 } }],
      record,
      wm,
      new FunctionRegistry(),
    );
    expect(wm.get(record.id)?.attributes['x']).toBe(1);
  });

  it('retract with target 0 removes the bound fact', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 1 });
    executeActions([{ kind: 'retract', target: 0 }], record, wm, new FunctionRegistry());
    expect(wm.get(record.id)).toBeUndefined();
  });

  it('retract with a non-zero target is a no-op', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 1 });
    executeActions([{ kind: 'retract', target: 5 }], record, wm, new FunctionRegistry());
    expect(wm.get(record.id)).toBeDefined();
  });

  it('invoke calls the registered function with the bound fact and args', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 42 });
    const registry = new FunctionRegistry();
    let receivedArgs: readonly FactValue[] = [];
    let receivedX: FactValue | undefined;
    registry.registerFunction('capture', (facts, args) => {
      receivedX = facts[0]?.attributes['x'];
      receivedArgs = args;
    });
    executeActions([{ kind: 'invoke', function: 'capture', args: ['a', 1] }], record, wm, registry);
    expect(receivedX).toBe(42);
    expect(receivedArgs).toEqual(['a', 1]);
  });

  it('invoke without args passes an empty array', () => {
    const wm = new WorkingMemory();
    const record = bound(wm, { x: 1 });
    const registry = new FunctionRegistry();
    let receivedArgs: readonly FactValue[] = ['sentinel'];
    registry.registerFunction('capture', (_facts, args) => {
      receivedArgs = args;
    });
    executeActions([{ kind: 'invoke', function: 'capture' }], record, wm, registry);
    expect(receivedArgs).toEqual([]);
  });
});
