/**
 * Execution of a rule's actions (the `then` part) when it fires.
 *
 * The executor turns each declarative {@link Action} into an effect on the
 * working memory or a call to a registered function. Because fact changes
 * feed back into the network, executing actions is what drives forward
 * chaining.
 *
 * @packageDocumentation
 */

import type { Action } from '../model/action.js';
import type { FactRecord } from '../model/fact.js';
import type { FunctionRegistry } from './function-registry.js';
import type { WorkingMemory } from './working-memory.js';

/**
 * Executes the actions of a fired rule against the working memory.
 *
 * In this single-fact activation model, the fact bound to the activation is at
 * target index `0`. Actions whose `target` refers to a non-existent binding are
 * ignored, so a malformed rule cannot crash the cycle.
 *
 * @param actions - The rule's `then` actions.
 * @param boundFact - The fact that activated the rule.
 * @param workingMemory - The working memory to mutate.
 * @param registry - Registry used to resolve invoked functions.
 *
 * @public
 */
export function executeActions(
  actions: readonly Action[],
  boundFact: FactRecord,
  workingMemory: WorkingMemory,
  registry: FunctionRegistry,
): void {
  for (const action of actions) {
    executeAction(action, boundFact, workingMemory, registry);
  }
}

/**
 * Executes a single action.
 */
function executeAction(
  action: Action,
  boundFact: FactRecord,
  workingMemory: WorkingMemory,
  registry: FunctionRegistry,
): void {
  switch (action.kind) {
    case 'insert':
      workingMemory.insert(action.fact);
      return;
    case 'modify':
      if (action.target === 0) {
        workingMemory.modify(boundFact.id, action.attributes);
      }
      return;
    case 'retract':
      if (action.target === 0) {
        workingMemory.retract(boundFact.id);
      }
      return;
    case 'invoke': {
      const fn = registry.getFunction(action.function);
      fn([boundFact], action.args ?? []);
      return;
    }
  }
}
