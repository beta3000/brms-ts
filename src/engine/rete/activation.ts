/**
 * Activations produced by terminal nodes of the RETE network.
 *
 * An activation represents a rule that is ready to fire because a fact (or, in
 * a full RETE, a tuple of facts) satisfies its `when` condition. Activations
 * are placed on the agenda and executed in priority order.
 *
 * @packageDocumentation
 */

import type { FactRecord } from '../../model/fact.js';
import type { Rule } from '../../model/rule.js';

/**
 * A rule instance ready to fire against a specific matched fact.
 *
 * In this engine each activation binds a rule to a single fact, since a rule's
 * `when` condition is evaluated against one fact at a time. Cross-fact
 * multi-pattern joins are intentionally out of scope for this version.
 *
 * @public
 */
export interface Activation {
  /**
   * Stable identifier of the activation, unique per rule/fact pair.
   */
  readonly id: string;
  /**
   * The rule that is ready to fire.
   */
  readonly rule: Rule;
  /**
   * The fact that satisfied the rule's condition.
   */
  readonly fact: FactRecord;
}

/**
 * The set of activation changes produced by processing a working-memory event.
 *
 * @public
 */
export interface ActivationDelta {
  /**
   * Activations newly created by the event.
   */
  readonly added: readonly Activation[];
  /**
   * Activations invalidated (and therefore removed) by the event.
   */
  readonly removed: readonly Activation[];
}

/**
 * Builds the stable identifier for the activation of a rule against a fact.
 *
 * @param ruleName - Name of the rule.
 * @param factId - Identifier of the matched fact.
 * @returns The activation id.
 *
 * @public
 */
export function activationId(ruleName: string, factId: string): string {
  return `${ruleName}\u0000${factId}`;
}
