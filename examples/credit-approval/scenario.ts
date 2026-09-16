/**
 * Credit-approval example scenario for **brms-ts**.
 *
 * This module wires a {@link RuleEngine} with the example rules, a custom
 * predicate, and custom functions, then evaluates a set of loan applications.
 * It is imported both by the CLI runner (`run.ts`) and by the integration test,
 * so the logic stays free of any I/O.
 *
 * @packageDocumentation
 */

import { RuleEngine } from '../../src/index.js';
import type { Fact, FactRecord, FactValue } from '../../src/index.js';

/**
 * A loan application supplied to the engine.
 *
 * @public
 */
export interface Application {
  /**
   * Unique application identifier.
   */
  readonly id: string;
  /**
   * Annual income.
   */
  readonly income: number;
  /**
   * Outstanding debt.
   */
  readonly debt: number;
  /**
   * Applicant age in years.
   */
  readonly age: number;
}

/**
 * The decision reached for a single application.
 *
 * @public
 */
export interface Decision {
  /**
   * Application identifier.
   */
  readonly id: string;
  /**
   * Final status: `approved`, `rejected`, `review`, or `pending`.
   */
  readonly status: string;
  /**
   * Human-readable reason for the decision, when set.
   */
  readonly reason: string;
}

/**
 * The result of running the credit-approval scenario.
 *
 * @public
 */
export interface ScenarioResult {
  /**
   * The decision per application, in insertion order.
   */
  readonly decisions: readonly Decision[];
  /**
   * Notifications emitted by rule `invoke` actions, in firing order.
   */
  readonly notifications: readonly string[];
  /**
   * Number of rules fired.
   */
  readonly fired: number;
}

/**
 * Reads a fact attribute as a string, defaulting to an empty string.
 */
function asString(value: FactValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Reads a fact attribute as a number, defaulting to zero.
 */
function asNumber(value: FactValue | undefined): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * Runs the credit-approval scenario against the given applications.
 *
 * @param applications - The applications to evaluate. Defaults to a
 *   representative sample.
 * @param rulesYaml - The rules to load as YAML/JSON text.
 * @returns The decisions, notifications, and number of rules fired.
 *
 * @public
 */
export function runCreditApproval(
  rulesYaml: string,
  applications: readonly Application[] = defaultApplications,
): ScenarioResult {
  const notifications: string[] = [];
  const engine = new RuleEngine();

  // Custom predicate: an application still needs its debt ratio computed.
  engine.registerPredicate('needsRatio', (fact) => fact.attributes['debtRatio'] === undefined);

  // Custom function: derive the debt ratio and mark the application pending.
  engine.registerFunction('computeRatio', (facts) => {
    const fact = facts[0];
    if (fact === undefined) {
      return;
    }
    const income = asNumber(fact.attributes['income']);
    const debt = asNumber(fact.attributes['debt']);
    const ratio = income === 0 ? 1 : debt / income;
    // Reach back into the engine to update the fact by id.
    const record = fact as FactRecord;
    engine.modify(record.id, { debtRatio: Math.round(ratio * 100) / 100, status: 'pending' });
  });

  // Custom function: record a notification message.
  engine.registerFunction('notify', (_facts, args) => {
    notifications.push(asString(args[0]));
  });

  engine.loadRules(rulesYaml);

  for (const application of applications) {
    const fact: Fact = {
      type: 'Application',
      attributes: {
        id: application.id,
        income: application.income,
        debt: application.debt,
        age: application.age,
        status: 'new',
      },
    };
    engine.insert(fact);
  }

  const fired = engine.fireAllRules();

  const decisions: Decision[] = engine.getFacts().map((fact) => ({
    id: asString(fact.attributes['id']),
    status: asString(fact.attributes['status']),
    reason: asString(fact.attributes['reason']),
  }));

  return { decisions, notifications, fired };
}

/**
 * A representative set of applications used when none is supplied.
 *
 * @public
 */
export const defaultApplications: readonly Application[] = [
  { id: 'app-1', income: 60000, debt: 12000, age: 35 }, // low risk -> approved
  { id: 'app-2', income: 40000, debt: 20000, age: 28 }, // high ratio -> review
  { id: 'app-3', income: 50000, debt: 5000, age: 16 }, // minor -> rejected
];
