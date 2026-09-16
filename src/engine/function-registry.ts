/**
 * Registry of custom predicates and functions referenced by rules.
 *
 * Rules reference predicates and functions **by name**; the engine resolves
 * those names against this registry at evaluation and execution time. This is a
 * deliberate security boundary: rules (which may come from untrusted JSON/YAML)
 * can only trigger code that the host application has explicitly registered.
 * No code is ever compiled or evaluated from rule data.
 *
 * @packageDocumentation
 */

import type { Fact, FactValue } from '../model/fact.js';
import { UnknownReferenceError } from './errors.js';

/**
 * A custom predicate: given the fact under evaluation and optional arguments,
 * returns whether the condition holds.
 *
 * @param fact - The fact currently being evaluated.
 * @param args - Arguments supplied by the rule condition.
 * @returns `true` if the predicate holds for the fact.
 *
 * @public
 */
export type PredicateFn = (fact: Fact, args: readonly FactValue[]) => boolean;

/**
 * A custom action function: produces a side effect when a rule fires.
 *
 * @param facts - The facts bound by the activated rule, in pattern order.
 * @param args - Arguments supplied by the rule action.
 *
 * @public
 */
export type ActionFn = (facts: readonly Fact[], args: readonly FactValue[]) => void;

/**
 * Holds the custom predicates and action functions available to the engine.
 *
 * @public
 */
export class FunctionRegistry {
  readonly #predicates = new Map<string, PredicateFn>();
  readonly #functions = new Map<string, ActionFn>();

  /**
   * Registers a custom predicate under the given name.
   *
   * @param name - Unique predicate name referenced from rule conditions.
   * @param fn - Predicate implementation.
   * @returns The registry, for chaining.
   */
  public registerPredicate(name: string, fn: PredicateFn): this {
    this.#predicates.set(name, fn);
    return this;
  }

  /**
   * Registers a custom action function under the given name.
   *
   * @param name - Unique function name referenced from rule actions.
   * @param fn - Function implementation.
   * @returns The registry, for chaining.
   */
  public registerFunction(name: string, fn: ActionFn): this {
    this.#functions.set(name, fn);
    return this;
  }

  /**
   * Resolves a predicate by name.
   *
   * @param name - Predicate name.
   * @returns The predicate implementation.
   * @throws {@link UnknownReferenceError} if no predicate is registered under
   *   `name`.
   */
  public getPredicate(name: string): PredicateFn {
    const fn = this.#predicates.get(name);
    if (fn === undefined) {
      throw new UnknownReferenceError('predicate', name);
    }
    return fn;
  }

  /**
   * Resolves an action function by name.
   *
   * @param name - Function name.
   * @returns The function implementation.
   * @throws {@link UnknownReferenceError} if no function is registered under
   *   `name`.
   */
  public getFunction(name: string): ActionFn {
    const fn = this.#functions.get(name);
    if (fn === undefined) {
      throw new UnknownReferenceError('function', name);
    }
    return fn;
  }

  /**
   * Reports whether a predicate is registered under the given name.
   *
   * @param name - Predicate name.
   * @returns `true` if the predicate exists.
   */
  public hasPredicate(name: string): boolean {
    return this.#predicates.has(name);
  }

  /**
   * Reports whether an action function is registered under the given name.
   *
   * @param name - Function name.
   * @returns `true` if the function exists.
   */
  public hasFunction(name: string): boolean {
    return this.#functions.has(name);
  }
}
