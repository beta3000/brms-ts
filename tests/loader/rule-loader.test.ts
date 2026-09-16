import { describe, expect, it } from '@jest/globals';

import { ValidationError } from '../../src/engine/errors.js';
import { loadRulesFromObject, loadRulesFromString } from '../../src/loader/rule-loader.js';

const YAML_SOURCE = `
rules:
  - name: adult-discount
    salience: 10
    noLoop: true
    when:
      kind: and
      conditions:
        - { kind: comparison, field: age, operator: gte, value: 18 }
        - { kind: predicate, predicate: isVip, args: [gold] }
    then:
      - { kind: modify, target: 0, attributes: { discount: 0.1 } }
      - { kind: invoke, function: audit, args: [discount-applied] }
`;

const JSON_SOURCE = JSON.stringify({
  rules: [
    {
      name: 'adult-discount',
      salience: 10,
      noLoop: true,
      when: {
        kind: 'and',
        conditions: [
          { kind: 'comparison', field: 'age', operator: 'gte', value: 18 },
          { kind: 'predicate', predicate: 'isVip', args: ['gold'] },
        ],
      },
      then: [
        { kind: 'modify', target: 0, attributes: { discount: 0.1 } },
        { kind: 'invoke', function: 'audit', args: ['discount-applied'] },
      ],
    },
  ],
});

describe('loadRulesFromString', () => {
  it('loads a valid YAML document', () => {
    const rules = loadRulesFromString(YAML_SOURCE);
    expect(rules).toHaveLength(1);
    const [rule] = rules;
    expect(rule?.name).toBe('adult-discount');
    expect(rule?.salience).toBe(10);
    expect(rule?.noLoop).toBe(true);
    expect(rule?.when.kind).toBe('and');
    expect(rule?.then).toHaveLength(2);
  });

  it('produces the same typed model from YAML and JSON', () => {
    expect(loadRulesFromString(YAML_SOURCE)).toEqual(loadRulesFromString(JSON_SOURCE));
  });

  it('applies defaults for salience and noLoop when omitted', () => {
    const rules = loadRulesFromString(`
rules:
  - name: minimal
    when: { kind: comparison, field: x, operator: eq, value: 1 }
    then: []
`);
    expect(rules[0]?.salience).toBe(0);
    expect(rules[0]?.noLoop).toBe(false);
  });

  it('throws a ValidationError on unparseable source', () => {
    expect(() => loadRulesFromString('foo: [unclosed')).toThrow(ValidationError);
  });
});

describe('loadRulesFromObject - validation errors', () => {
  it('rejects a document without rules', () => {
    expect(() => loadRulesFromObject({})).toThrow(ValidationError);
  });

  it('rejects an unknown condition kind with a descriptive message', () => {
    try {
      loadRulesFromObject({
        rules: [{ name: 'r', when: { kind: 'wat' }, then: [] }],
      });
      throw new Error('expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validation = error as ValidationError;
      expect(validation.details.some((d) => d.includes('unknown condition kind "wat"'))).toBe(true);
    }
  });

  it('rejects an invalid comparison operator', () => {
    try {
      loadRulesFromObject({
        rules: [
          {
            name: 'r',
            when: { kind: 'comparison', field: 'a', operator: 'like', value: 1 },
            then: [],
          },
        ],
      });
      throw new Error('expected ValidationError');
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.details.some((d) => d.includes('operator'))).toBe(true);
    }
  });

  it('rejects an unknown action kind', () => {
    try {
      loadRulesFromObject({
        rules: [
          {
            name: 'r',
            when: { kind: 'comparison', field: 'a', operator: 'eq', value: 1 },
            then: [{ kind: 'explode' }],
          },
        ],
      });
      throw new Error('expected ValidationError');
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.details.some((d) => d.includes('unknown action kind "explode"'))).toBe(
        true,
      );
    }
  });

  it('rejects a negative modify/retract target', () => {
    try {
      loadRulesFromObject({
        rules: [
          {
            name: 'r',
            when: { kind: 'comparison', field: 'a', operator: 'eq', value: 1 },
            then: [{ kind: 'retract', target: -1 }],
          },
        ],
      });
      throw new Error('expected ValidationError');
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.details.some((d) => d.includes('target'))).toBe(true);
    }
  });

  it('rejects duplicate rule names', () => {
    try {
      loadRulesFromObject({
        rules: [
          {
            name: 'dup',
            when: { kind: 'comparison', field: 'a', operator: 'eq', value: 1 },
            then: [],
          },
          {
            name: 'dup',
            when: { kind: 'comparison', field: 'a', operator: 'eq', value: 1 },
            then: [],
          },
        ],
      });
      throw new Error('expected ValidationError');
    } catch (error) {
      const validation = error as ValidationError;
      expect(validation.details.some((d) => d.includes('duplicate rule name'))).toBe(true);
    }
  });

  it('accepts insert actions with nested facts and not/or conditions', () => {
    const rules = loadRulesFromObject({
      rules: [
        {
          name: 'complex',
          when: {
            kind: 'or',
            conditions: [
              {
                kind: 'not',
                condition: { kind: 'comparison', field: 'x', operator: 'eq', value: 0 },
              },
              { kind: 'predicate', predicate: 'p' },
            ],
          },
          then: [
            {
              kind: 'insert',
              fact: { type: 'Flag', attributes: { active: true, meta: { level: 2 } } },
            },
          ],
        },
      ],
    });
    expect(rules[0]?.when.kind).toBe('or');
    expect(rules[0]?.then[0]?.kind).toBe('insert');
  });
});
