/**
 * The working memory: the store of facts the engine reasons over.
 *
 * The working memory is the equivalent of Drools' working memory. It supports
 * inserting, modifying, and retracting facts, and notifies subscribers of every
 * change. Those notifications are the foundation of the incremental RETE
 * behaviour built on top in later stages: the network reacts to fact changes
 * rather than re-scanning all facts on each cycle.
 *
 * @packageDocumentation
 */

import type { Fact, FactAttributes, FactId, FactRecord, FactValue } from '../model/fact.js';

/**
 * A change applied to the working memory, delivered to listeners.
 *
 * @public
 */
export type WorkingMemoryEvent =
  | {
      /**
       * A fact was inserted.
       */
      readonly type: 'inserted';
      /**
       * The newly inserted fact record.
       */
      readonly fact: FactRecord;
    }
  | {
      /**
       * A fact was modified.
       */
      readonly type: 'modified';
      /**
       * The fact record after modification.
       */
      readonly fact: FactRecord;
      /**
       * The fact record as it was before modification.
       */
      readonly previous: FactRecord;
    }
  | {
      /**
       * A fact was retracted.
       */
      readonly type: 'retracted';
      /**
       * The fact record that was removed.
       */
      readonly fact: FactRecord;
    };

/**
 * A subscriber notified of working-memory changes.
 *
 * @param event - The change that occurred.
 *
 * @public
 */
export type WorkingMemoryListener = (event: WorkingMemoryEvent) => void;

/**
 * Unsubscribes a previously registered listener.
 *
 * @public
 */
export type Unsubscribe = () => void;

/**
 * In-memory store of facts with change notifications.
 *
 * @public
 */
export class WorkingMemory {
  readonly #facts = new Map<FactId, FactRecord>();
  readonly #listeners = new Set<WorkingMemoryListener>();
  #nextId = 0;

  /**
   * Subscribes to working-memory change events.
   *
   * @param listener - Callback invoked on every insert/modify/retract.
   * @returns A function that removes the subscription when called.
   */
  public subscribe(listener: WorkingMemoryListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Inserts a fact and notifies listeners.
   *
   * @param fact - The fact to insert.
   * @returns The stored fact record, including its generated id.
   */
  public insert(fact: Fact): FactRecord {
    const id = `f${String(this.#nextId++)}`;
    const record: FactRecord = { id, type: fact.type, attributes: fact.attributes };
    this.#facts.set(id, record);
    this.#emit({ type: 'inserted', fact: record });
    return record;
  }

  /**
   * Modifies the attributes of an existing fact and notifies listeners.
   *
   * The supplied attributes are merged over the current ones. The modification
   * is a no-op (returns `undefined`) when the fact does not exist.
   *
   * @param id - Identifier of the fact to modify.
   * @param attributes - Attributes to merge into the fact.
   * @returns The updated fact record, or `undefined` if the id is unknown.
   */
  public modify(id: FactId, attributes: Partial<FactAttributes>): FactRecord | undefined {
    const previous = this.#facts.get(id);
    if (previous === undefined) {
      return undefined;
    }
    const mergedAttributes: Record<string, FactValue> = { ...previous.attributes };
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        mergedAttributes[key] = value;
      }
    }
    const merged: FactRecord = {
      id,
      type: previous.type,
      attributes: mergedAttributes,
    };
    this.#facts.set(id, merged);
    this.#emit({ type: 'modified', fact: merged, previous });
    return merged;
  }

  /**
   * Retracts a fact and notifies listeners.
   *
   * @param id - Identifier of the fact to retract.
   * @returns `true` if a fact was removed, `false` if the id was unknown.
   */
  public retract(id: FactId): boolean {
    const record = this.#facts.get(id);
    if (record === undefined) {
      return false;
    }
    this.#facts.delete(id);
    this.#emit({ type: 'retracted', fact: record });
    return true;
  }

  /**
   * Returns the fact record for an id, if present.
   *
   * @param id - Identifier of the fact.
   * @returns The fact record, or `undefined` if not found.
   */
  public get(id: FactId): FactRecord | undefined {
    return this.#facts.get(id);
  }

  /**
   * Returns a snapshot of all fact records currently in the working memory.
   *
   * @returns An array of the stored fact records.
   */
  public getAll(): readonly FactRecord[] {
    return [...this.#facts.values()];
  }

  /**
   * Number of facts currently stored.
   */
  public get size(): number {
    return this.#facts.size;
  }

  /**
   * Removes all facts. Does not emit retraction events.
   */
  public clear(): void {
    this.#facts.clear();
  }

  /**
   * Delivers an event to every subscribed listener.
   */
  #emit(event: WorkingMemoryEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}
