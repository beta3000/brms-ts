import { describe, expect, it } from '@jest/globals';

import { WorkingMemory } from '../../src/engine/working-memory.js';
import type { WorkingMemoryEvent } from '../../src/engine/working-memory.js';
import type { Fact } from '../../src/model/fact.js';

function customer(name: string, age: number): Fact {
  return { type: 'Customer', attributes: { name, age } };
}

describe('WorkingMemory - lifecycle', () => {
  it('inserts a fact and assigns a unique id', () => {
    const wm = new WorkingMemory();
    const a = wm.insert(customer('Ada', 30));
    const b = wm.insert(customer('Bob', 40));
    expect(a.id).not.toBe(b.id);
    expect(wm.size).toBe(2);
    expect(wm.get(a.id)?.attributes['name']).toBe('Ada');
  });

  it('modifies a fact by merging attributes', () => {
    const wm = new WorkingMemory();
    const a = wm.insert(customer('Ada', 30));
    const updated = wm.modify(a.id, { age: 31 });
    expect(updated?.attributes).toEqual({ name: 'Ada', age: 31 });
    expect(wm.get(a.id)?.attributes['age']).toBe(31);
  });

  it('modify returns undefined for an unknown id', () => {
    const wm = new WorkingMemory();
    expect(wm.modify('missing', { age: 1 })).toBeUndefined();
  });

  it('retracts a fact', () => {
    const wm = new WorkingMemory();
    const a = wm.insert(customer('Ada', 30));
    expect(wm.retract(a.id)).toBe(true);
    expect(wm.get(a.id)).toBeUndefined();
    expect(wm.size).toBe(0);
  });

  it('retract returns false for an unknown id', () => {
    const wm = new WorkingMemory();
    expect(wm.retract('missing')).toBe(false);
  });

  it('getAll returns a snapshot of stored facts', () => {
    const wm = new WorkingMemory();
    wm.insert(customer('Ada', 30));
    wm.insert(customer('Bob', 40));
    expect(wm.getAll()).toHaveLength(2);
  });

  it('clear removes all facts', () => {
    const wm = new WorkingMemory();
    wm.insert(customer('Ada', 30));
    wm.clear();
    expect(wm.size).toBe(0);
  });
});

describe('WorkingMemory - change events', () => {
  it('emits inserted/modified/retracted events', () => {
    const wm = new WorkingMemory();
    const events: WorkingMemoryEvent[] = [];
    wm.subscribe((event) => events.push(event));

    const a = wm.insert(customer('Ada', 30));
    wm.modify(a.id, { age: 31 });
    wm.retract(a.id);

    expect(events.map((e) => e.type)).toEqual(['inserted', 'modified', 'retracted']);
    const modified = events[1];
    if (modified?.type === 'modified') {
      expect(modified.previous.attributes['age']).toBe(30);
      expect(modified.fact.attributes['age']).toBe(31);
    } else {
      throw new Error('expected a modified event');
    }
  });

  it('stops notifying after unsubscribe', () => {
    const wm = new WorkingMemory();
    let count = 0;
    const unsubscribe = wm.subscribe(() => {
      count += 1;
    });
    wm.insert(customer('Ada', 30));
    unsubscribe();
    wm.insert(customer('Bob', 40));
    expect(count).toBe(1);
  });

  it('does not emit events on no-op modify/retract', () => {
    const wm = new WorkingMemory();
    let count = 0;
    wm.subscribe(() => {
      count += 1;
    });
    wm.modify('missing', { age: 1 });
    wm.retract('missing');
    expect(count).toBe(0);
  });
});
