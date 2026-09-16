/**
 * Alpha nodes and alpha memories of the RETE network.
 *
 * An alpha node compiles a single rule's `when` condition into a filter over
 * individual facts. Its alpha memory holds every fact for which the condition
 * currently holds. Because the working memory notifies the network of each
 * change, the alpha memory is maintained **incrementally**: inserting,
 * modifying, or retracting a fact updates only the affected memberships rather
 * than re-scanning all facts — the defining characteristic of RETE.
 *
 * @packageDocumentation
 */

import type { Condition } from '../../model/condition.js';
import type { FactId, FactRecord } from '../../model/fact.js';
import { evaluateCondition } from '../evaluator.js';
import type { FunctionRegistry } from '../function-registry.js';

/**
 * The outcome of applying a fact change to an alpha node's memory.
 *
 * @public
 */
export type AlphaMembershipChange = 'added' | 'removed' | 'retained' | 'unchanged';

/**
 * An alpha node: filters facts by a rule's `when` condition and remembers the
 * facts that currently match.
 *
 * @public
 */
export class AlphaNode {
  readonly #condition: Condition;
  readonly #registry: FunctionRegistry;
  readonly #memory = new Map<FactId, FactRecord>();

  /**
   * Creates an alpha node for a condition.
   *
   * @param condition - The rule's `when` condition to test facts against.
   * @param registry - Registry used to resolve custom predicates.
   */
  public constructor(condition: Condition, registry: FunctionRegistry) {
    this.#condition = condition;
    this.#registry = registry;
  }

  /**
   * Evaluates a newly inserted fact and stores it if it matches.
   *
   * @param fact - The inserted fact record.
   * @returns `"added"` if the fact matched and entered the memory, otherwise
   *   `"unchanged"`.
   */
  public insert(fact: FactRecord): AlphaMembershipChange {
    if (evaluateCondition(this.#condition, fact, this.#registry)) {
      this.#memory.set(fact.id, fact);
      return 'added';
    }
    return 'unchanged';
  }

  /**
   * Re-evaluates a modified fact and updates the memory accordingly.
   *
   * @param fact - The fact record after modification.
   * @returns
   *   - `"added"` if the fact now matches and was not present before,
   *   - `"removed"` if the fact no longer matches and was present before,
   *   - `"retained"` if it matched before and still matches,
   *   - `"unchanged"` if it did not match before and still does not.
   */
  public modify(fact: FactRecord): AlphaMembershipChange {
    const wasPresent = this.#memory.has(fact.id);
    const matches = evaluateCondition(this.#condition, fact, this.#registry);
    if (matches) {
      this.#memory.set(fact.id, fact);
      return wasPresent ? 'retained' : 'added';
    }
    if (wasPresent) {
      this.#memory.delete(fact.id);
      return 'removed';
    }
    return 'unchanged';
  }

  /**
   * Removes a retracted fact from the memory.
   *
   * @param id - Identifier of the retracted fact.
   * @returns `"removed"` if the fact was present, otherwise `"unchanged"`.
   */
  public retract(id: FactId): AlphaMembershipChange {
    return this.#memory.delete(id) ? 'removed' : 'unchanged';
  }

  /**
   * Returns whether a fact is currently in the alpha memory.
   *
   * @param id - Identifier of the fact.
   * @returns `true` if the fact is a current match.
   */
  public has(id: FactId): boolean {
    return this.#memory.has(id);
  }

  /**
   * Returns a snapshot of the facts currently matching the condition.
   *
   * @returns The matching fact records.
   */
  public matches(): readonly FactRecord[] {
    return [...this.#memory.values()];
  }

  /**
   * Number of facts currently held in the alpha memory.
   */
  public get size(): number {
    return this.#memory.size;
  }

  /**
   * Empties the alpha memory.
   */
  public clear(): void {
    this.#memory.clear();
  }
}
