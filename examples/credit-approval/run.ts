/**
 * CLI runner for the credit-approval example.
 *
 * Reads the bundled `rules.yaml`, runs the scenario, and prints the decisions
 * and notifications. Invoke it with `npm run example`.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCreditApproval } from './scenario.js';

const here = dirname(fileURLToPath(import.meta.url));
const rulesYaml = readFileSync(join(here, 'rules.yaml'), 'utf8');

const result = runCreditApproval(rulesYaml);

console.log(`Fired ${String(result.fired)} rules.\n`);
console.log('Decisions:');
for (const decision of result.decisions) {
  console.log(`  ${decision.id}: ${decision.status} (${decision.reason || 'no reason'})`);
}
console.log('\nNotifications:');
for (const message of result.notifications) {
  console.log(`  - ${message}`);
}
