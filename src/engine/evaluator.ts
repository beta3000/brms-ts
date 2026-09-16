/**
 * Recursive evaluator for the condition AST.
 *
 * The evaluator **interprets** the declarative {@link Condition} tree; it never
 * compiles or evaluates strings as code (`eval`/`new Function` are never used).
 * This keeps rule data — which may be untrusted — from executing arbitrary
 * logic.
 *
 * @packageDocumentation
 */

import type { ComparisonCondition, ComparisonOperator, Condition } from '../model/condition.js';
import type { Fact, FactValue } from '../model/fact.js';
import { readFieldPath } from './field-access.js';
import type { FunctionRegistry } from './function-registry.js';

/**
 * Evaluates a condition against a single fact.
 *
 * @param condition - The condition AST to evaluate.
 * @param fact - The fact to test.
 * @param registry - Registry used to resolve custom predicates.
 * @returns `true` if the condition holds for the fact.
 * @throws {@link UnknownReferenceError} if a referenced predicate is not
 *   registered.
 *
 * @public
 */
export function evaluateCondition(
  condition: Condition,
  fact: Fact,
  registry: FunctionRegistry,
): boolean {
  switch (condition.kind) {
    case 'comparison':
      return evaluateComparison(condition, fact);
    case 'predicate': {
      const predicate = registry.getPredicate(condition.predicate);
      return predicate(fact, condition.args ?? []);
    }
    case 'and':
      return condition.conditions.every((sub) => evaluateCondition(sub, fact, registry));
    case 'or':
      return condition.conditions.some((sub) => evaluateCondition(sub, fact, registry));
    case 'not':
      return !evaluateCondition(condition.condition, fact, registry);
  }
}

/**
 * Evaluates a comparison condition against a fact.
 *
 * @param condition - The comparison condition.
 * @param fact - The fact to test.
 * @returns `true` if the comparison holds.
 */
function evaluateComparison(condition: ComparisonCondition, fact: Fact): boolean {
  const actual = readFieldPath(fact.attributes, condition.field);
  return applyOperator(condition.operator, actual, condition.value);
}

/**
 * Applies a comparison operator to a pair of values.
 *
 * @param operator - Operator to apply.
 * @param actual - Value read from the fact (may be `undefined` when absent).
 * @param expected - Reference value from the condition.
 * @returns The boolean result of the comparison.
 */
function applyOperator(
  operator: ComparisonOperator,
  actual: FactValue | undefined,
  expected: FactValue,
): boolean {
  switch (operator) {
    case 'eq':
      return isEqual(actual, expected);
    case 'neq':
      return !isEqual(actual, expected);
    case 'gt':
      return compareOrdered(actual, expected) > 0;
    case 'gte':
      return compareOrdered(actual, expected) >= 0;
    case 'lt':
      return compareOrdered(actual, expected) < 0;
    case 'lte':
      return compareOrdered(actual, expected) <= 0;
    case 'in':
      return isIn(actual, expected);
    case 'contains':
      return contains(actual, expected);
  }
}

/**
 * Structural equality for primitive fact values and shallow arrays.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns `true` if the values are considered equal.
 */
function isEqual(a: FactValue | undefined, b: FactValue): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return false;
}

/**
 * Compares two ordered values (numbers or strings). Returns `NaN`-safe sentinel
 * results so that ordering against incompatible or missing values is always
 * `false`.
 *
 * @param actual - Value read from the fact.
 * @param expected - Reference value.
 * @returns A negative, zero, or positive number, or `NaN` when not comparable.
 */
function compareOrdered(actual: FactValue | undefined, expected: FactValue): number {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual - expected;
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual < expected ? -1 : actual > expected ? 1 : 0;
  }
  // Not comparable: every ordering operator should yield false.
  return Number.NaN;
}

/**
 * Tests whether `actual` is a member of the `expected` array.
 *
 * @param actual - Candidate value.
 * @param expected - Array to search; when not an array, the result is `false`.
 * @returns `true` if `actual` is contained in `expected`.
 */
function isIn(actual: FactValue | undefined, expected: FactValue): boolean {
  if (!Array.isArray(expected) || actual === undefined) {
    return false;
  }
  return expected.some((item) => item === actual);
}

/**
 * Tests whether `actual` contains `expected`. For strings, substring match; for
 * arrays, membership.
 *
 * @param actual - Container value (string or array).
 * @param expected - Value to look for.
 * @returns `true` if `actual` contains `expected`.
 */
function contains(actual: FactValue | undefined, expected: FactValue): boolean {
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.includes(expected);
  }
  if (Array.isArray(actual)) {
    return actual.some((item) => item === expected);
  }
  return false;
}
