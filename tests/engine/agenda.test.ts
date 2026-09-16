import { describe, expect, it } from '@jest/globals';

import { Agenda } from '../../src/engine/agenda.js';
import type { Activation } from '../../src/engine/rete/activation.js';
import { defineRule } from '../../src/model/rule.js';
import { compare } from '../../src/model/rule.js';
import type { FactRecord } from '../../src/model/fact.js';

const fact: FactRecord = { id: 'f0', type: 'X', attributes: {} };

function activation(ruleName: string, salience: number, factId = 'f0'): Activation {
  const rule = defineRule({ name: ruleName, salience, when: compare('x', 'eq', 1), then: [] });
  return { id: `${ruleName}#${factId}`, rule, fact: { ...fact, id: factId } };
}

describe('Agenda - conflict resolution', () => {
  it('pops higher salience first', () => {
    const agenda = new Agenda();
    agenda.add(activation('low', 1), 0);
    agenda.add(activation('high', 10), 1);
    expect(agenda.pop()?.rule.name).toBe('high');
    expect(agenda.pop()?.rule.name).toBe('low');
  });

  it('breaks ties by definition order', () => {
    const agenda = new Agenda();
    agenda.add(activation('second', 5), 1);
    agenda.add(activation('first', 5), 0);
    expect(agenda.pop()?.rule.name).toBe('first');
    expect(agenda.pop()?.rule.name).toBe('second');
  });

  it('peek does not remove the activation', () => {
    const agenda = new Agenda();
    agenda.add(activation('r', 1), 0);
    expect(agenda.peek()?.rule.name).toBe('r');
    expect(agenda.size).toBe(1);
  });

  it('reports empty state', () => {
    const agenda = new Agenda();
    expect(agenda.isEmpty).toBe(true);
    agenda.add(activation('r', 1), 0);
    expect(agenda.isEmpty).toBe(false);
    agenda.pop();
    expect(agenda.isEmpty).toBe(true);
  });

  it('pop on an empty agenda returns undefined', () => {
    expect(new Agenda().pop()).toBeUndefined();
    expect(new Agenda().peek()).toBeUndefined();
  });
});

describe('Agenda - unique activations', () => {
  it('does not re-schedule an activation that already fired', () => {
    const agenda = new Agenda();
    const act = activation('r', 1);
    agenda.add(act, 0);
    expect(agenda.pop()?.id).toBe(act.id);
    // Same activation added again is suppressed.
    expect(agenda.add(act, 0)).toBe(false);
    expect(agenda.isEmpty).toBe(true);
  });

  it('allows re-firing after the activation is removed (fact changed)', () => {
    const agenda = new Agenda();
    const act = activation('r', 1);
    agenda.add(act, 0);
    agenda.pop();
    // Remove clears the fired mark, modelling the fact no longer matching...
    expect(agenda.remove(act.id)).toBe(false); // already popped, not pending
    // ...so it can be scheduled again.
    expect(agenda.add(act, 0)).toBe(true);
    expect(agenda.size).toBe(1);
  });

  it('remove takes a pending activation off the agenda', () => {
    const agenda = new Agenda();
    const act = activation('r', 1);
    agenda.add(act, 0);
    expect(agenda.remove(act.id)).toBe(true);
    expect(agenda.isEmpty).toBe(true);
  });

  it('clear empties entries and fired history', () => {
    const agenda = new Agenda();
    const act = activation('r', 1);
    agenda.add(act, 0);
    agenda.pop();
    agenda.clear();
    // After clear, the previously fired activation can be scheduled again.
    expect(agenda.add(act, 0)).toBe(true);
  });
});
