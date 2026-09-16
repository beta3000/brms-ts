/**
 * Types for the **conditions** model (the `when` part of a rule).
 *
 * Conditions are described as data (a declarative AST), never as executable
 * code. The engine interprets them safely; `eval` and `new Function` are never
 * used.
 *
 * @packageDocumentation
 */

import type { FactValue } from './fact.js';

/**
 * Comparison operators supported in a comparison condition.
 *
 * - `eq`: equal.
 * - `neq`: not equal.
 * - `gt`: greater than.
 * - `gte`: greater than or equal.
 * - `lt`: less than.
 * - `lte`: less than or equal.
 * - `in`: the field value is contained in the given array.
 * - `contains`: the field value (string or array) contains the given value.
 *
 * @public
 */
export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

/**
 * Comparison condition over a fact field.
 *
 * Compares the value of the `field` of the fact against `value` using
 * `operator`.
 *
 * @public
 */
export interface ComparisonCondition {
  /**
   * Union discriminator: always `"comparison"`.
   */
  readonly kind: 'comparison';
  /**
   * Path of the field within the fact attributes. Supports nested access with
   * dots, for example `"address.city"`.
   */
  readonly field: string;
  /**
   * Comparison operator to apply.
   */
  readonly operator: ComparisonOperator;
  /**
   * Reference value the field is compared against.
   */
  readonly value: FactValue;
}

/**
 * Condition that invokes a custom predicate registered by name.
 *
 * Allows logic not covered by the standard operators, without resorting to
 * dynamic code evaluation.
 *
 * @public
 */
export interface PredicateCondition {
  /**
   * Union discriminator: always `"predicate"`.
   */
  readonly kind: 'predicate';
  /**
   * Name of the predicate registered in the engine.
   */
  readonly predicate: string;
  /**
   * Optional arguments passed to the predicate.
   */
  readonly args?: readonly FactValue[];
}

/**
 * Logical conjunction: holds if **all** sub-conditions hold.
 *
 * @public
 */
export interface AndCondition {
  /**
   * Union discriminator: always `"and"`.
   */
  readonly kind: 'and';
  /**
   * Sub-conditions that must all hold together.
   */
  readonly conditions: readonly Condition[];
}

/**
 * Logical disjunction: holds if **any** sub-condition holds.
 *
 * @public
 */
export interface OrCondition {
  /**
   * Union discriminator: always `"or"`.
   */
  readonly kind: 'or';
  /**
   * Sub-conditions of which at least one must hold.
   */
  readonly conditions: readonly Condition[];
}

/**
 * Logical negation: holds if the sub-condition does **not** hold.
 *
 * @public
 */
export interface NotCondition {
  /**
   * Union discriminator: always `"not"`.
   */
  readonly kind: 'not';
  /**
   * Sub-condition to negate.
   */
  readonly condition: Condition;
}

/**
 * A condition from the `when` part of a rule.
 *
 * A discriminated union on the `kind` field that recursively combines
 * comparisons, custom predicates, and logical combinators.
 *
 * @public
 */
export type Condition =
  | ComparisonCondition
  | PredicateCondition
  | AndCondition
  | OrCondition
  | NotCondition;
