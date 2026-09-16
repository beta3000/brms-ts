import { describe, expect, it } from '@jest/globals';

import { ValidationError } from '../../src/engine/errors.js';
import { loadRulesFromObject } from '../../src/loader/rule-loader.js';

/**
 * Builds a document with a single rule whose `when`/`then` are supplied by the
 * caller, so each test can target a specific validation branch.
 */
function doc(when: unknown, then: readonly unknown[] = []): unknown {
  return { rules: [{ name: 'r', when, then }] };
}

/**
 * Loads a document expecting failure, returning the collected detail messages.
 */
function expectDetails(document: unknown): readonly string[] {
  try {
    loadRulesFromObject(document);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details;
  }
  throw new Error('expected ValidationError');
}

describe('condition validation branches', () => {
  it('condition that is not an object', () => {
    expect(expectDetails(doc('nope')).some((d) => d.includes('must be an object'))).toBe(true);
  });

  it('comparison with a non-string field', () => {
    const details = expectDetails(doc({ kind: 'comparison', field: 1, operator: 'eq', value: 1 }));
    expect(details.some((d) => d.includes('"field"'))).toBe(true);
  });

  it('comparison with an invalid fact value', () => {
    const details = expectDetails(
      doc({ kind: 'comparison', field: 'a', operator: 'eq', value: () => 1 }),
    );
    expect(details.some((d) => d.includes('"value"'))).toBe(true);
  });

  it('predicate with a non-string name', () => {
    const details = expectDetails(doc({ kind: 'predicate', predicate: 5 }));
    expect(details.some((d) => d.includes('"predicate"'))).toBe(true);
  });

  it('predicate with invalid args', () => {
    const details = expectDetails(doc({ kind: 'predicate', predicate: 'p', args: 'no' }));
    expect(details.some((d) => d.includes('"args"'))).toBe(true);
  });

  it('and/or with an empty conditions array', () => {
    const details = expectDetails(doc({ kind: 'and', conditions: [] }));
    expect(details.some((d) => d.includes('non-empty'))).toBe(true);
  });

  it('and with an invalid nested condition', () => {
    const details = expectDetails(
      doc({
        kind: 'and',
        conditions: [{ kind: 'comparison', field: 'a', operator: 'nope', value: 1 }],
      }),
    );
    expect(details.some((d) => d.includes('operator'))).toBe(true);
  });

  it('not with an invalid inner condition', () => {
    const details = expectDetails(doc({ kind: 'not', condition: { kind: 'ghost' } }));
    expect(details.some((d) => d.includes('unknown condition kind'))).toBe(true);
  });
});

describe('action validation branches', () => {
  const validWhen = { kind: 'comparison', field: 'a', operator: 'eq', value: 1 };

  it('action that is not an object', () => {
    const details = expectDetails(doc(validWhen, ['nope']));
    expect(details.some((d) => d.includes('action must be an object'))).toBe(true);
  });

  it('insert with an invalid fact type', () => {
    const details = expectDetails(
      doc(validWhen, [{ kind: 'insert', fact: { type: '', attributes: {} } }]),
    );
    expect(details.some((d) => d.includes('"type"'))).toBe(true);
  });

  it('insert with invalid fact attributes', () => {
    const details = expectDetails(
      doc(validWhen, [{ kind: 'insert', fact: { type: 'F', attributes: 5 } }]),
    );
    expect(details.some((d) => d.includes('"attributes"'))).toBe(true);
  });

  it('modify with invalid attributes', () => {
    const details = expectDetails(doc(validWhen, [{ kind: 'modify', target: 0, attributes: 3 }]));
    expect(details.some((d) => d.includes('"attributes"'))).toBe(true);
  });

  it('modify with a non-integer target', () => {
    const details = expectDetails(
      doc(validWhen, [{ kind: 'modify', target: 1.5, attributes: {} }]),
    );
    expect(details.some((d) => d.includes('target'))).toBe(true);
  });

  it('invoke with a non-string function', () => {
    const details = expectDetails(doc(validWhen, [{ kind: 'invoke', function: 9 }]));
    expect(details.some((d) => d.includes('"function"'))).toBe(true);
  });

  it('invoke with invalid args', () => {
    const details = expectDetails(doc(validWhen, [{ kind: 'invoke', function: 'f', args: 3 }]));
    expect(details.some((d) => d.includes('"args"'))).toBe(true);
  });
});

describe('fact value acceptance', () => {
  it('accepts nested arrays and objects as fact values', () => {
    const rules = loadRulesFromObject(
      doc({ kind: 'comparison', field: 'a', operator: 'in', value: [1, 'two', true, null, [3]] }, [
        { kind: 'insert', fact: { type: 'F', attributes: { nested: { deep: [1, 2] } } } },
      ]),
    );
    expect(rules).toHaveLength(1);
  });
});
