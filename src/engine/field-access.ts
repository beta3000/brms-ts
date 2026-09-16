/**
 * Safe access to nested fields of a fact using dot notation.
 *
 * @packageDocumentation
 */

import type { FactValue } from '../model/fact.js';

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
