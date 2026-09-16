/**
 * Barrel of the domain model: facts, conditions, actions, and rules.
 *
 * @packageDocumentation
 */

export type { Fact, FactAttributes, FactId, FactPrimitive, FactRecord, FactValue } from './fact.js';
export type {
  AndCondition,
  ComparisonCondition,
  ComparisonOperator,
  Condition,
  NotCondition,
  OrCondition,
  PredicateCondition,
} from './condition.js';
export type { Action, InsertAction, InvokeAction, ModifyAction, RetractAction } from './action.js';
export type { Rule, RuleInput } from './rule.js';
export { and, compare, defineRule, DEFAULT_SALIENCE, not, or, predicate } from './rule.js';
