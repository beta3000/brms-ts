import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { runCreditApproval } from '../examples/credit-approval/scenario.js';

const rulesYaml = readFileSync(
  join(process.cwd(), 'examples', 'credit-approval', 'rules.yaml'),
  'utf8',
);

describe('credit-approval example', () => {
  it('produces the expected decisions for the default applications', () => {
    const result = runCreditApproval(rulesYaml);
    const byId = new Map(result.decisions.map((d) => [d.id, d]));

    expect(byId.get('app-1')?.status).toBe('approved');
    expect(byId.get('app-1')?.reason).toBe('low-risk');

    expect(byId.get('app-2')?.status).toBe('review');
    expect(byId.get('app-2')?.reason).toBe('high-debt-ratio');

    expect(byId.get('app-3')?.status).toBe('rejected');
    expect(byId.get('app-3')?.reason).toBe('underage');
  });

  it('emits a notification for each decision', () => {
    const result = runCreditApproval(rulesYaml);
    expect(result.notifications).toContain('approved: low-risk');
    expect(result.notifications).toContain('manual review: high debt ratio');
    expect(result.notifications).toContain('rejected: underage');
  });

  it('fires at least one rule per application', () => {
    const result = runCreditApproval(rulesYaml);
    expect(result.fired).toBeGreaterThanOrEqual(3);
  });
});
