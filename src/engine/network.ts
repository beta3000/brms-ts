/**
 * The RETE network session: wires the working memory, rule terminal nodes, and
 * agenda together and runs the inference cycle.
 *
 * Fact changes in the working memory are routed to every rule node, whose
 * activation deltas update the agenda incrementally. `fireAllRules` then drains
 * the agenda in priority order, executing each activation's actions — which may
 * change facts and produce further activations (forward chaining) — until the
 * agenda is empty or a safety limit is reached.
 *
 * @packageDocumentation
 */

import type { Rule } from '../model/rule.js';
import { Agenda } from './agenda.js';
import { CycleLimitExceededError } from './errors.js';
import { executeActions } from './executor.js';
import type { FunctionRegistry } from './function-registry.js';
import type { ActivationDelta } from './rete/activation.js';
import { RuleNode } from './rete/rule-node.js';
import type { WorkingMemory, WorkingMemoryEvent } from './working-memory.js';

/**
 * Default safety limit on the number of rule firings in a single
 * `fireAllRules` call.
 *
 * @public
 */
export const DEFAULT_CYCLE_LIMIT = 10_000;

/**
 * Options controlling a {@link ReteNetwork}.
 *
 * @public
 */
export interface NetworkOptions {
  /**
   * Maximum number of rule firings before {@link CycleLimitExceededError} is
   * thrown. Defaults to {@link DEFAULT_CYCLE_LIMIT}.
   */
  readonly cycleLimit?: number;
}

/**
 * Connects a working memory and a set of rules to an agenda and runs inference.
 *
 * @public
 */
export class ReteNetwork {
  readonly #workingMemory: WorkingMemory;
  readonly #registry: FunctionRegistry;
  readonly #agenda = new Agenda();
  readonly #nodes: RuleNode[] = [];
  readonly #orderByRule = new Map<string, number>();
  readonly #cycleLimit: number;
  #unsubscribe: (() => void) | undefined = undefined;
  /**
   * Name of the rule currently firing, used to enforce `no-loop`.
   */
  #firingRule: string | undefined = undefined;

  /**
   * Creates a network bound to a working memory and function registry.
   *
   * @param workingMemory - The working memory to observe and mutate.
   * @param registry - Registry resolving predicates and functions.
   * @param rules - The rules to compile into terminal nodes.
   * @param options - Optional network settings.
   */
  public constructor(
    workingMemory: WorkingMemory,
    registry: FunctionRegistry,
    rules: readonly Rule[],
    options: NetworkOptions = {},
  ) {
    this.#workingMemory = workingMemory;
    this.#registry = registry;
    this.#cycleLimit = options.cycleLimit ?? DEFAULT_CYCLE_LIMIT;

    rules.forEach((rule, index) => {
      this.#nodes.push(new RuleNode(rule, registry));
      this.#orderByRule.set(rule.name, index);
    });

    // Seed the network with any facts already present, then react to changes.
    for (const fact of workingMemory.getAll()) {
      this.#route({ type: 'inserted', fact });
    }
    this.#unsubscribe = workingMemory.subscribe((event) => {
      this.#route(event);
    });
  }

  /**
   * Fires activations in priority order until the agenda is empty.
   *
   * @returns The number of rules fired.
   * @throws {@link CycleLimitExceededError} if the configured cycle limit is
   *   exceeded, which indicates a probable infinite loop.
   */
  public fireAllRules(): number {
    let fired = 0;
    let activation = this.#agenda.pop();
    while (activation !== undefined) {
      if (fired >= this.#cycleLimit) {
        throw new CycleLimitExceededError(this.#cycleLimit);
      }
      this.#firingRule = activation.rule.noLoop ? activation.rule.name : undefined;
      executeActions(activation.rule.then, activation.fact, this.#workingMemory, this.#registry);
      this.#firingRule = undefined;
      fired += 1;
      activation = this.#agenda.pop();
    }
    return fired;
  }

  /**
   * Number of activations currently pending on the agenda.
   */
  public get pendingActivations(): number {
    return this.#agenda.size;
  }

  /**
   * Detaches the network from the working memory, stopping it from reacting to
   * further fact changes. Call this before discarding a network or replacing it
   * with one built over the same working memory.
   */
  public dispose(): void {
    if (this.#unsubscribe !== undefined) {
      this.#unsubscribe();
      this.#unsubscribe = undefined;
    }
    this.#agenda.clear();
  }

  /**
   * Routes a working-memory event to every rule node and updates the agenda.
   */
  #route(event: WorkingMemoryEvent): void {
    for (const node of this.#nodes) {
      this.#applyDelta(node, this.#processNode(node, event));
    }
  }

  /**
   * Dispatches a single event to a rule node.
   */
  #processNode(node: RuleNode, event: WorkingMemoryEvent): ActivationDelta {
    switch (event.type) {
      case 'inserted':
        return node.insert(event.fact);
      case 'modified':
        return node.modify(event.fact);
      case 'retracted':
        return node.retract(event.fact.id);
    }
  }

  /**
   * Applies an activation delta to the agenda, honouring `no-loop`.
   */
  #applyDelta(node: RuleNode, delta: ActivationDelta): void {
    const order = this.#orderByRule.get(node.rule.name) ?? 0;
    for (const activation of delta.removed) {
      this.#agenda.remove(activation.id);
    }
    for (const activation of delta.added) {
      // no-loop: a firing rule must not re-activate itself from its own actions.
      if (this.#firingRule === activation.rule.name) {
        continue;
      }
      this.#agenda.add(activation, order);
    }
  }
}
