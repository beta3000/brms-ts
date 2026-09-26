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

import type {
  BinaryComparisonOperator,
  ComparisonCondition,
  ComparisonOperator,
  Condition,
} from '../model/condition.js';
import type { Fact, FactValue } from '../model/fact.js';
import { readFieldPath, resolveArgs, resolveValue } from './field-access.js';
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
      return predicate(fact, resolveArgs(condition.args ?? [], fact));
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
  const expected = condition.value === undefined ? undefined : resolveValue(condition.value, fact);
  return applyOperator(condition.operator, actual, expected);
}

/**
 * Applies a comparison operator to a pair of values.
 *
 * The unary operators (`isEmpty`, `exists`) inspect `actual` only and ignore
 * `expected`. Binary operators require an `expected` value; when it is
 * `undefined` (a malformed programmatic rule) they all yield `false`, including
 * `neq`.
 *
 * @param operator - Operator to apply.
 * @param actual - Value read from the fact (may be `undefined` when absent).
 * @param expected - Resolved reference value from the condition.
 * @returns The boolean result of the comparison.
 */
function applyOperator(
  operator: ComparisonOperator,
  actual: FactValue | undefined,
  expected: FactValue | undefined,
): boolean {
  switch (operator) {
    case 'isEmpty':
      return isEmptyValue(actual);
    case 'exists':
      return existsValue(actual);
    default:
      return expected !== undefined && applyBinaryOperator(operator, actual, expected);
  }
}

/**
 * Applies a binary comparison operator to a pair of values.
 *
 * @param operator - Binary operator to apply.
 * @param actual - Value read from the fact (may be `undefined` when absent).
 * @param expected - Reference value from the condition.
 * @returns The boolean result of the comparison.
 */
function applyBinaryOperator(
  operator: BinaryComparisonOperator,
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
    case 'between':
      return isBetween(actual, expected);
    case 'startsWith':
      return typeof actual === 'string' && typeof expected === 'string'
        ? actual.startsWith(expected)
        : false;
    case 'endsWith':
      return typeof actual === 'string' && typeof expected === 'string'
        ? actual.endsWith(expected)
        : false;
    case 'matches': {
      if (typeof actual !== 'string' || typeof expected !== 'string') {
        return false;
      }
      const pattern = compilePattern(expected);
      return pattern?.test(actual) ?? false;
    }
  }
}

/**
 * Tests whether `actual` lies within the inclusive `[min, max]` range held by
 * `expected`.
 *
 * Only numeric or string ranges are comparable; any other shape (including a
 * missing or differently sized array) yields `false`.
 *
 * @param actual - Value read from the fact.
 * @param expected - Candidate `[min, max]` range.
 * @returns `true` if `actual` is within the inclusive range.
 */
function isBetween(actual: FactValue | undefined, expected: FactValue): boolean {
  if (!Array.isArray(expected) || expected.length !== 2) {
    return false;
  }
  const [min, max] = expected;
  if (min === undefined || max === undefined) {
    return false;
  }
  return compareOrdered(actual, min) >= 0 && compareOrdered(actual, max) <= 0;
}

/**
 * Tests whether a value is "empty": absent, `null`, an empty string, an empty
 * array, or an object with no keys. `0` and `false` are not empty.
 *
 * @param actual - Value read from the fact.
 * @returns `true` if the value is empty.
 */
function isEmptyValue(actual: FactValue | undefined): boolean {
  if (actual === undefined || actual === null || actual === '') {
    return true;
  }
  if (Array.isArray(actual)) {
    return actual.length === 0;
  }
  if (typeof actual === 'object') {
    return Object.keys(actual).length === 0;
  }
  return false;
}

/**
 * Tests whether a value is present (not absent and not `null`). `0`, `false`,
 * and `''` exist.
 *
 * @param actual - Value read from the fact.
 * @returns `true` if the value exists.
 */
function existsValue(actual: FactValue | undefined): boolean {
  return actual !== undefined && actual !== null;
}

/**
 * Maximum number of compiled patterns kept in {@link COMPILED_PATTERNS}.
 */
const PATTERN_CACHE_LIMIT = 256;

/**
 * Cache of compiled `matches` patterns. Invalid patterns are cached as `null`
 * so repeated evaluations do not recompile them. Eviction is FIFO.
 */
const COMPILED_PATTERNS = new Map<string, RegExp | null>();

/**
 * Compiles a `matches` pattern, memoizing the outcome.
 *
 * @param pattern - Regular-expression source text.
 * @returns The compiled pattern, or `null` when the source is not a valid
 *   regular expression.
 */
function compilePattern(pattern: string): RegExp | null {
  const cached = COMPILED_PATTERNS.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  let compiled: RegExp | null;
  try {
    compiled = new RegExp(pattern);
  } catch {
    compiled = null;
  }
  if (COMPILED_PATTERNS.size >= PATTERN_CACHE_LIMIT) {
    const oldest = COMPILED_PATTERNS.keys().next().value;
    if (oldest !== undefined) {
      COMPILED_PATTERNS.delete(oldest);
    }
  }
  COMPILED_PATTERNS.set(pattern, compiled);
  return compiled;
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
