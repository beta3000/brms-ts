/**
 * The agenda: the ordered set of activations waiting to fire.
 *
 * When several rules are eligible at the same time, the agenda decides the
 * firing order (conflict resolution). This engine resolves conflicts by
 * **salience** (higher first) and breaks ties by **rule definition order**
 * (earlier rules first), matching Drools' default behaviour.
 *
 * The agenda also enforces *unique activations*: an activation that has already
 * fired is not fired again unless it is removed and re-created (which happens
 * when the underlying facts change). This, together with the `no-loop` rule
 * flag honoured by the executor, prevents runaway inference.
 *
 * @packageDocumentation
 */

import type { Activation } from './rete/activation.js';

/**
 * An agenda entry: an activation plus the metadata used to order it.
 */
interface AgendaEntry {
  readonly activation: Activation;
  readonly definitionOrder: number;
}

/**
 * Ordered collection of pending activations with salience-based conflict
 * resolution.
 *
 * @public
 */
export class Agenda {
  readonly #entries = new Map<string, AgendaEntry>();
  readonly #fired = new Set<string>();

  /**
   * Adds an activation to the agenda.
   *
   * Adding an activation whose id has already fired is a no-op, which enforces
   * unique-activation semantics. Re-adding an activation that is already
   * pending simply refreshes its bound data.
   *
   * @param activation - The activation to schedule.
   * @param definitionOrder - Index of the rule in definition order, used as the
   *   tie-breaker when saliences are equal.
   * @returns `true` if the activation was scheduled, `false` if it was
   *   suppressed because it had already fired.
   */
  public add(activation: Activation, definitionOrder: number): boolean {
    if (this.#fired.has(activation.id)) {
      return false;
    }
    this.#entries.set(activation.id, { activation, definitionOrder });
    return true;
  }

  /**
   * Removes an activation from the agenda by id.
   *
   * Also clears its fired mark, so the same rule/fact pair may fire again if it
   * is re-activated later (for example after the fact changes and matches
   * again).
   *
   * @param activationId - Identifier of the activation to remove.
   * @returns `true` if a pending activation was removed.
   */
  public remove(activationId: string): boolean {
    this.#fired.delete(activationId);
    return this.#entries.delete(activationId);
  }

  /**
   * Returns the highest-priority pending activation without removing it.
   *
   * @returns The next activation to fire, or `undefined` if the agenda is
   *   empty.
   */
  public peek(): Activation | undefined {
    let best: AgendaEntry | undefined;
    for (const entry of this.#entries.values()) {
      if (best === undefined || comparePriority(entry, best) < 0) {
        best = entry;
      }
    }
    return best?.activation;
  }

  /**
   * Removes and returns the highest-priority pending activation, marking it as
   * fired so it will not be scheduled again until re-activated.
   *
   * @returns The next activation to fire, or `undefined` if the agenda is
   *   empty.
   */
  public pop(): Activation | undefined {
    const next = this.peek();
    if (next === undefined) {
      return undefined;
    }
    this.#entries.delete(next.id);
    this.#fired.add(next.id);
    return next;
  }

  /**
   * Whether the agenda currently has no pending activations.
   */
  public get isEmpty(): boolean {
    return this.#entries.size === 0;
  }

  /**
   * Number of pending activations.
   */
  public get size(): number {
    return this.#entries.size;
  }

  /**
   * Clears all pending activations and the fired history.
   */
  public clear(): void {
    this.#entries.clear();
    this.#fired.clear();
  }
}

/**
 * Compares two agenda entries by priority.
 *
 * Returns a negative number when `a` should fire before `b`. Higher salience
 * wins; ties are broken by lower definition order.
 *
 * @param a - First entry.
 * @param b - Second entry.
 * @returns Negative, zero, or positive per standard comparator conventions.
 */
function comparePriority(a: AgendaEntry, b: AgendaEntry): number {
  if (a.activation.rule.salience !== b.activation.rule.salience) {
    return b.activation.rule.salience - a.activation.rule.salience;
  }
  return a.definitionOrder - b.definitionOrder;
}
