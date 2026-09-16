/**
 * Types for the **actions** model (the `then` part of a rule).
 *
 * Actions describe the effect a rule produces when it fires: inserting,
 * modifying, or retracting facts, or invoking a registered function.
 *
 * @packageDocumentation
 */

import type { Fact, FactAttributes, FactValue } from './fact.js';

/**
 * Action that inserts a new fact into the working memory.
 *
 * @public
 */
export interface InsertAction {
  /**
   * Union discriminator: always `"insert"`.
   */
  readonly kind: 'insert';
  /**
   * Fact to insert.
   */
  readonly fact: Fact;
}

/**
 * Action that modifies attributes of a fact bound by the rule.
 *
 * @public
 */
export interface ModifyAction {
  /**
   * Union discriminator: always `"modify"`.
   */
  readonly kind: 'modify';
  /**
   * Zero-based index of the fact bound by the rule to modify. For single
   * pattern rules it is `0`.
   */
  readonly target: number;
  /**
   * Attributes to overwrite or add on the target fact.
   */
  readonly attributes: Partial<FactAttributes>;
}

/**
 * Action that retracts (removes) a fact bound by the rule.
 *
 * @public
 */
export interface RetractAction {
  /**
   * Union discriminator: always `"retract"`.
   */
  readonly kind: 'retract';
  /**
   * Zero-based index of the fact bound by the rule to retract.
   */
  readonly target: number;
}

/**
 * Action that invokes a function registered in the engine by its name.
 *
 * Enables custom side effects (logging, notifications, calculations) without
 * resorting to dynamic code evaluation.
 *
 * @public
 */
export interface InvokeAction {
  /**
   * Union discriminator: always `"invoke"`.
   */
  readonly kind: 'invoke';
  /**
   * Name of the registered function to invoke.
   */
  readonly function: string;
  /**
   * Optional arguments passed to the function.
   */
  readonly args?: readonly FactValue[];
}

/**
 * An action from the `then` part of a rule.
 *
 * A discriminated union on the `kind` field.
 *
 * @public
 */
export type Action = InsertAction | ModifyAction | RetractAction | InvokeAction;
