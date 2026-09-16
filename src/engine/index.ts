/**
 * Barrel of the engine internals available to consumers.
 *
 * @packageDocumentation
 */

export {
  BrmsError,
  CycleLimitExceededError,
  UnknownReferenceError,
  ValidationError,
} from './errors.js';
export { FunctionRegistry } from './function-registry.js';
export type { ActionFn, PredicateFn } from './function-registry.js';
export { readFieldPath } from './field-access.js';
export { evaluateCondition } from './evaluator.js';
export { WorkingMemory } from './working-memory.js';
export type { Unsubscribe, WorkingMemoryEvent, WorkingMemoryListener } from './working-memory.js';
export * from './rete/index.js';
