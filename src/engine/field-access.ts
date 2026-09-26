/**
 * Safe access to nested fields of a fact using dot notation.
 *
 * @packageDocumentation
 */

import type { Fact, FactAttributes, FactValue, FieldReference } from '../model/fact.js';

/**
 * Field-name segments that are refused to prevent prototype-pollution style
 * access through crafted rule data.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Reads a nested value from a fact's attributes using a dot-separated path.
 *
 * For example, the path `"address.city"` reads `attributes.address.city`.
 * Returns `undefined` when any segment along the path is missing or when the
 * traversal reaches a non-object before the path is exhausted.
 *
 * Access to `__proto__`, `prototype`, and `constructor` segments is refused and
 * yields `undefined`, so untrusted rule data cannot walk the prototype chain.
 *
 * @param source - Root value to read from (typically the fact attributes).
 * @param path - Dot-separated field path.
 * @returns The value at the path, or `undefined` if it cannot be resolved.
 *
 * @public
 */
export function readFieldPath(source: FactValue, path: string): FactValue | undefined {
  const segments = path.split('.');
  let current: FactValue | undefined = source;

  for (const segment of segments) {
    if (FORBIDDEN_KEYS.has(segment)) {
      return undefined;
    }
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

/**
 * Determines whether a rule value is a well-formed {@link FieldReference}: a
 * plain object whose only key is a non-empty `$fact` string.
 *
 * @param value - Candidate rule value.
 * @returns `true` if the value is a field reference.
 *
 * @public
 */
export function isFieldReference(value: FactValue | undefined): value is FieldReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '$fact' && isNonEmptyString(value['$fact']);
}

/**
 * Resolves a rule value against the fact bound to the rule.
 *
 * Field references (`{ $fact: 'path' }`) are resolved with
 * {@link readFieldPath} against `fact.attributes`; arrays and objects are
 * resolved recursively into copies. The result of the top-level call is
 * `undefined` when the value is a reference that does not resolve; nested
 * references that do not resolve materialize as `null` because
 * {@link FactValue} does not admit `undefined`. All other values are returned
 * unchanged.
 *
 * @param value - Rule value to resolve.
 * @param fact - Fact bound to the rule.
 * @returns The resolved value, or `undefined` when a top-level reference does
 *   not resolve.
 *
 * @public
 */
export function resolveValue(value: FactValue, fact: Fact): FactValue | undefined {
  if (isFieldReference(value)) {
    return readFieldPath(fact.attributes, value.$fact);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, fact) ?? null);
  }
  if (value !== null && typeof value === 'object') {
    return resolveAttributes(value, fact);
  }
  return value;
}

/**
 * Resolves a rule argument list against the fact bound to the rule.
 *
 * Unresolved references are substituted with `null` so every argument is a
 * valid {@link FactValue}.
 *
 * @param args - Rule arguments to resolve.
 * @param fact - Fact bound to the rule.
 * @returns The resolved arguments.
 */
export function resolveArgs(args: readonly FactValue[], fact: Fact): readonly FactValue[] {
  return args.map((arg) => resolveValue(arg, fact) ?? null);
}

/**
 * Resolves the values of a rule attributes object against the fact bound to
 * the rule.
 *
 * Unresolved references are substituted with `null`. Entries whose value is
 * `undefined` are omitted (they carry no value to merge). The `__proto__` key
 * is copied as an own data property so a crafted attribute name cannot mutate
 * the prototype of the result.
 *
 * @param attributes - Rule attributes to resolve.
 * @param fact - Fact bound to the rule.
 * @returns A new attributes object with the resolved values.
 */
export function resolveAttributes(attributes: Partial<FactAttributes>, fact: Fact): FactAttributes {
  const resolved: Record<string, FactValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    Object.defineProperty(resolved, key, {
      value: resolveValue(value, fact) ?? null,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return resolved;
}

/**
 * Checks whether a value is a non-empty string.
 */
function isNonEmptyString(value: FactValue | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
