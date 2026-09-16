/**
 * The public facade of the business rule engine.
 *
 * {@link RuleEngine} composes the working memory, the function registry, and
 * the RETE network into a single ergonomic, typed API. It is the entry point
 * most applications should use.
 *
 * @packageDocumentation
 */

import { loadRulesFromObject, loadRulesFromString } from '../loader/rule-loader.js';
import type { Fact, FactAttributes, FactId, FactRecord } from '../model/fact.js';
import type { Rule } from '../model/rule.js';
import type { ActionFn, PredicateFn } from './function-registry.js';
import { FunctionRegistry } from './function-registry.js';
import { ReteNetwork } from './network.js';
import { WorkingMemory } from './working-memory.js';

/**
 * Options for constructing a {@link RuleEngine}.
 *
 * @public
 */
export interface RuleEngineOptions {
  /**
   * Maximum number of rule firings per `fireAllRules` call before a
   * {@link CycleLimitExceededError} is thrown. Guards against infinite loops.
   */
  readonly cycleLimit?: number;
}

/**
 * A business rule engine that loads declarative rules, matches them against
 * facts, and fires them in priority order.
 *
 * Typical usage:
 * 1. Construct the engine.
 * 2. Register any custom predicates and functions the rules reference.
 * 3. Load the rules (from YAML/JSON text, a parsed object, or typed rules).
 * 4. Insert facts and call {@link RuleEngine.fireAllRules}.
 *
 * @example
 * ```ts
 * const engine = new RuleEngine();
 * engine.registerFunction('approve', (facts) => {
 *   console.log('approved', facts[0]?.attributes['id']);
 * });
 * engine.loadRules(`
 * rules:
 *   - name: approve-adults
 *     when: { kind: comparison, field: age, operator: gte, value: 18 }
 *     then:
 *       - { kind: invoke, function: approve }
 * `);
 * engine.insert({ type: 'Applicant', attributes: { id: 'a1', age: 20 } });
 * engine.fireAllRules();
 * ```
 *
 * @public
 */
export class RuleEngine {
  readonly #workingMemory = new WorkingMemory();
  readonly #registry = new FunctionRegistry();
  readonly #options: RuleEngineOptions;
  #network: ReteNetwork | undefined = undefined;
  #rules: readonly Rule[] = [];

  /**
   * Creates a rule engine.
   *
   * @param options - Optional engine settings.
   */
  public constructor(options: RuleEngineOptions = {}) {
    this.#options = options;
  }

  /**
   * Registers a custom predicate referenced from rule conditions.
   *
   * Register predicates before loading rules that use them and before firing.
   *
   * @param name - Predicate name.
   * @param fn - Predicate implementation.
   * @returns The engine, for chaining.
   */
  public registerPredicate(name: string, fn: PredicateFn): this {
    this.#registry.registerPredicate(name, fn);
    return this;
  }

  /**
   * Registers a custom function referenced from rule `invoke` actions.
   *
   * @param name - Function name.
   * @param fn - Function implementation.
   * @returns The engine, for chaining.
   */
  public registerFunction(name: string, fn: ActionFn): this {
    this.#registry.registerFunction(name, fn);
    return this;
  }

  /**
   * Loads rules into the engine, replacing any previously loaded rules.
   *
   * Accepts raw YAML or JSON text, an already-parsed object, or an array of
   * typed {@link Rule} objects. Rules are compiled into a fresh network over
   * the existing facts, so loading rules after inserting facts still matches
   * them.
   *
   * @param source - The rules to load.
   * @returns The engine, for chaining.
   * @throws {@link ValidationError} if textual or object input is invalid.
   */
  public loadRules(source: unknown): this {
    this.#rules = normalizeRules(source);
    this.#network?.dispose();
    this.#network = new ReteNetwork(
      this.#workingMemory,
      this.#registry,
      this.#rules,
      this.#options.cycleLimit === undefined ? {} : { cycleLimit: this.#options.cycleLimit },
    );
    return this;
  }

  /**
   * Inserts a fact into the working memory.
   *
   * @param fact - The fact to insert.
   * @returns The stored fact record with its generated id.
   */
  public insert(fact: Fact): FactRecord {
    return this.#workingMemory.insert(fact);
  }

  /**
   * Modifies the attributes of an existing fact.
   *
   * @param id - Identifier of the fact.
   * @param attributes - Attributes to merge.
   * @returns The updated fact record, or `undefined` if the id is unknown.
   */
  public modify(id: FactId, attributes: Partial<FactAttributes>): FactRecord | undefined {
    return this.#workingMemory.modify(id, attributes);
  }

  /**
   * Retracts a fact from the working memory.
   *
   * @param id - Identifier of the fact.
   * @returns `true` if a fact was removed.
   */
  public retract(id: FactId): boolean {
    return this.#workingMemory.retract(id);
  }

  /**
   * Fires all eligible rules in priority order until none remain.
   *
   * @returns The number of rules fired.
   * @throws {@link CycleLimitExceededError} if the cycle limit is exceeded.
   */
  public fireAllRules(): number {
    return this.#network?.fireAllRules() ?? 0;
  }

  /**
   * Returns a snapshot of all facts currently in the working memory.
   *
   * @returns The current fact records.
   */
  public getFacts(): readonly FactRecord[] {
    return this.#workingMemory.getAll();
  }

  /**
   * Returns the rules currently loaded into the engine.
   *
   * @returns The loaded rules.
   */
  public getRules(): readonly Rule[] {
    return this.#rules;
  }
}

/**
 * Normalizes the accepted rule sources into a typed rule array.
 */
function normalizeRules(source: unknown): readonly Rule[] {
  if (typeof source === 'string') {
    return loadRulesFromString(source);
  }
  if (Array.isArray(source) && source.every(isRule)) {
    return source;
  }
  return loadRulesFromObject(source);
}

/**
 * Determines whether a value is already a typed {@link Rule}.
 */
function isRule(value: unknown): value is Rule {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['name'] === 'string' &&
    typeof candidate['salience'] === 'number' &&
    typeof candidate['noLoop'] === 'boolean' &&
    typeof candidate['when'] === 'object' &&
    Array.isArray(candidate['then'])
  );
}
