import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { evaluateCondition } from '../../src/engine/evaluator.js';
import { resolveAttributes, resolveValue } from '../../src/engine/field-access.js';
import { FunctionRegistry } from '../../src/engine/function-registry.js';
import { compare } from '../../src/model/rule.js';
import type { Fact, FactAttributes } from '../../src/model/fact.js';

const srcRoot = join(process.cwd(), 'src');

/**
 * Recursively collects the absolute paths of every `.ts` file under `dir`.
 */
function collectTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      result.push(full);
    }
  }
  return result;
}

describe('security: no dynamic code evaluation', () => {
  it('the src tree contains no eval or Function constructor calls', () => {
    const files = collectTsFiles(srcRoot);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    // Matches `eval(`, `new Function(`, and `Function(` as a constructor call.
    const forbidden = /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(/;
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      if (forbidden.test(contents)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a field value that looks like code is treated as a plain string, not executed', () => {
    const registry = new FunctionRegistry();
    const fact: Fact = {
      type: 'Malicious',
      attributes: { expr: 'process.exit(1)' },
    };
    // Comparing against the literal string must simply be a string comparison.
    const condition = compare('expr', 'eq', 'process.exit(1)');
    expect(evaluateCondition(condition, fact, registry)).toBe(true);
  });

  it('a $fact reference with a prototype-polluting path resolves to undefined', () => {
    const fact: Fact = { type: 'T', attributes: { a: 1 } };
    expect(resolveValue({ $fact: '__proto__' }, fact)).toBeUndefined();
    expect(resolveValue({ $fact: 'constructor.prototype' }, fact)).toBeUndefined();
    expect(resolveValue({ $fact: 'a.__proto__.polluted' }, fact)).toBeUndefined();
  });

  it('resolving attributes keeps a crafted __proto__ key as an own data property', () => {
    const fact: Fact = { type: 'T', attributes: {} };
    // JSON.parse produces an own `__proto__` data property, as YAML rule data
    // can. Resolving must copy it without touching the object prototype.
    const source = JSON.parse('{"__proto__": {"polluted": true}}') as FactAttributes;
    const resolved = resolveAttributes(source, fact);
    expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(resolved, '__proto__')).toBe(true);
    expect(resolved).toEqual(source);
  });
});
