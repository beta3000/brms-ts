/**
 * The **rule** type and factory utilities to build rules and conditions in a
 * typed, ergonomic way.
 *
 * @packageDocumentation
 */

import type { Action } from './action.js';
import type {
  AndCondition,
  ComparisonCondition,
  ComparisonOperator,
  Condition,
  NotCondition,
  OrCondition,
  PredicateCondition,
} from './condition.js';
import type { FactValue } from './fact.js';

/**
 * Default salience (priority) of a rule when none is specified.
 *
 * @public
 */
export const DEFAULT_SALIENCE = 0;

/**
 * A business rule: a pattern of conditions (`when`) and actions (`then`).
 *
 * @public
 */
export interface Rule {
  /**
   * Unique name of the rule, used in the agenda and for debugging.
   */
  readonly name: string;
  /**
   * Priority of the rule. The higher the salience, the earlier it fires.
   * Defaults to {@link DEFAULT_SALIENCE}.
   */
  readonly salience: number;
  /**
   * When `true`, the rule is not re-activated by its own fact modifications
   * (equivalent to `no-loop` in Drools).
   */
  readonly noLoop: boolean;
  /**
   * Condition that must hold for the rule to activate.
   */
  readonly when: Condition;
  /**
   * Actions to execute when the rule fires.
   */
  readonly then: readonly Action[];
}

/**
 * Input data to create a rule, with optional fields that receive default
 * values.
 *
 * @public
 */
export interface RuleInput {
  /**
   * Unique name of the rule.
   */
  readonly name: string;
  /**
   * Optional priority (defaults to {@link DEFAULT_SALIENCE}).
   */
  readonly salience?: number;
  /**
   * Optional `no-loop` flag (defaults to `false`).
   */
  readonly noLoop?: boolean;
  /**
   * The `when` condition.
   */
  readonly when: Condition;
  /**
   * The `then` actions.
   */
  readonly then: readonly Action[];
}

/**
 * Creates a {@link Rule} applying the default values for `salience` and
 * `noLoop`.
 *
 * @param input - Rule data.
 * @returns The normalized rule.
 *
 * @example
 * ```ts
 * const rule = defineRule({
 *   name: 'customer-is-adult',
 *   when: compare('age', 'gte', 18),
 *   then: [invoke('markAsAdult')],
 * });
 * ```
 *
 * @public
 */
export function defineRule(input: RuleInput): Rule {
  return {
    name: input.name,
    salience: input.salience ?? DEFAULT_SALIENCE,
    noLoop: input.noLoop ?? false,
    when: input.when,
    then: input.then,
  };
}

/**
 * Builds a comparison condition.
 *
 * @param field - Path of the fact field (supports dots for nesting).
 * @param operator - Comparison operator.
 * @param value - Reference value.
 * @returns The comparison condition.
 *
 * @public
 */
export function compare(
  field: string,
  operator: ComparisonOperator,
  value: FactValue,
): ComparisonCondition {
  return { kind: 'comparison', field, operator, value };
}

/**
 * Builds a custom predicate condition.
 *
 * @param name - Name of the registered predicate.
 * @param args - Optional predicate arguments.
 * @returns The predicate condition.
 *
 * @public
 */
export function predicate(name: string, ...args: readonly FactValue[]): PredicateCondition {
  return args.length > 0
    ? { kind: 'predicate', predicate: name, args }
    : { kind: 'predicate', predicate: name };
}

/**
 * Builds a logical conjunction (`and`).
 *
 * @param conditions - Sub-conditions that must all hold.
 * @returns The `and` condition.
 *
 * @public
 */
export function and(...conditions: readonly Condition[]): AndCondition {
  return { kind: 'and', conditions };
}

/**
 * Builds a logical disjunction (`or`).
 *
 * @param conditions - Sub-conditions of which at least one must hold.
 * @returns The `or` condition.
 *
 * @public
 */
export function or(...conditions: readonly Condition[]): OrCondition {
  return { kind: 'or', conditions };
}

/**
 * Builds a logical negation (`not`).
 *
 * @param condition - Sub-condition to negate.
 * @returns The `not` condition.
 *
 * @public
 */
export function not(condition: Condition): NotCondition {
  return { kind: 'not', condition };
}
