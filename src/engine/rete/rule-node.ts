/**
 * Rule node: the terminal of the RETE network for a single rule.
 *
 * A rule node wraps the rule's {@link AlphaNode} and turns alpha-memory
 * membership changes into {@link Activation} changes. When a fact enters the
 * alpha memory an activation is created; when it leaves, the activation is
 * removed. This is the bridge between the pattern-matching network and the
 * agenda.
 *
 * In a full RETE this terminal would sit behind a chain of beta (join) nodes
 * combining several patterns. Because a rule's `when` is evaluated against a
 * single fact here, the join is degenerate and the rule node consumes the alpha
 * memory directly.
 *
 * @packageDocumentation
 */

import type { FactId, FactRecord } from '../../model/fact.js';
import type { Rule } from '../../model/rule.js';
import type { FunctionRegistry } from '../function-registry.js';
import { AlphaNode } from './alpha.js';
import type { Activation, ActivationDelta } from './activation.js';
import { activationId } from './activation.js';

const EMPTY_DELTA: ActivationDelta = { added: [], removed: [] };

/**
 * Terminal node for one rule; maintains the rule's activations incrementally.
 *
 * @public
 */
export class RuleNode {
  readonly #rule: Rule;
  readonly #alpha: AlphaNode;
  readonly #activations = new Map<FactId, Activation>();

  /**
   * Creates a rule node.
   *
   * @param rule - The rule this node represents.
   * @param registry - Registry used to resolve custom predicates.
   */
  public constructor(rule: Rule, registry: FunctionRegistry) {
    this.#rule = rule;
    this.#alpha = new AlphaNode(rule.when, registry);
  }

  /**
   * The rule represented by this node.
   */
  public get rule(): Rule {
    return this.#rule;
  }

  /**
   * Processes an inserted fact, creating an activation if it matches.
   *
   * @param fact - The inserted fact record.
   * @returns The activation changes caused by the insert.
   */
  public insert(fact: FactRecord): ActivationDelta {
    return this.#alpha.insert(fact) === 'added' ? this.#activate(fact) : EMPTY_DELTA;
  }

  /**
   * Processes a modified fact, creating or removing an activation as needed.
   *
   * @param fact - The fact record after modification.
   * @returns The activation changes caused by the modification.
   */
  public modify(fact: FactRecord): ActivationDelta {
    switch (this.#alpha.modify(fact)) {
      case 'added':
        return this.#activate(fact);
      case 'removed':
        return this.#deactivate(fact.id);
      case 'retained':
        // Still matching: refresh the bound fact so actions see current data.
        return this.#activate(fact);
      case 'unchanged':
        return EMPTY_DELTA;
    }
  }

  /**
   * Processes a retracted fact, removing any activation bound to it.
   *
   * @param id - Identifier of the retracted fact.
   * @returns The activation changes caused by the retraction.
   */
  public retract(id: FactId): ActivationDelta {
    this.#alpha.retract(id);
    return this.#deactivate(id);
  }

  /**
   * Returns a snapshot of the current activations of this rule.
   *
   * @returns The current activations.
   */
  public activations(): readonly Activation[] {
    return [...this.#activations.values()];
  }

  /**
   * Creates or refreshes the activation for a matched fact.
   */
  #activate(fact: FactRecord): ActivationDelta {
    const existing = this.#activations.get(fact.id);
    const activation: Activation = {
      id: activationId(this.#rule.name, fact.id),
      rule: this.#rule,
      fact,
    };
    this.#activations.set(fact.id, activation);
    // Refreshing an existing activation is not a new agenda entry.
    return existing === undefined ? { added: [activation], removed: [] } : EMPTY_DELTA;
  }

  /**
   * Removes the activation bound to a fact, if any.
   */
  #deactivate(id: FactId): ActivationDelta {
    const existing = this.#activations.get(id);
    if (existing === undefined) {
      return EMPTY_DELTA;
    }
    this.#activations.delete(id);
    return { added: [], removed: [existing] };
  }
}
