import { test } from 'node:test';
import assert from 'node:assert';
import { evaluatePolicies } from '../../dist/risk-engine/policy-evaluator.js';
import { SystemModel } from '../../dist/core/model.js';

test('Risk Engine Policy Evaluator Test Suite', async (t) => {

  await t.test('1. Declarative Policy Engine', () => {
    const model: SystemModel = {
      system: 'test-policies',
      version: '1.0',
      agents: [
        {
          id: 'supervised-agent',
          purpose: 'Test',
          autonomy: 'supervised',
          allowed_tools: ['dangerous-tool']
        }
      ],
      tools: [
        {
          id: 'dangerous-tool',
          type: 'api',
          risk: 'critical',
          requires_human_approval: false // Fails policy: requires approval!
        }
      ],
      policies: [
        {
          id: 'approve-critical-write-tools',
          severity: 'critical',
          when: {
            'agent.autonomy': 'supervised',
            'tool.risk': 'critical'
          },
          require: {
            'tool.requires_human_approval': true
          }
        }
      ]
    };

    const findings = evaluatePolicies(model);
    const hasViolation = findings.some(f => f.id.startsWith('R-1') && f.agentId === 'supervised-agent');
    assert.strictEqual(hasViolation, true, 'Declarative policy should flag supervised agent calling critical tool without approval');
  });

  await t.test('2. Legacy String Policy Fallbacks', () => {
    const model: SystemModel = {
      system: 'legacy-test',
      version: '1.0',
      agents: [
        {
          id: 'agent-a',
          purpose: 'Test',
          spend_limit: { max_cost_usd: 1.0 },
          retry_policy: { max_retries: 15 }
        }
      ],
      policies: [
        'max_cost_per_task_usd: 0.50',
        'max_tool_calls_per_task: 10'
      ]
    };

    const findings = evaluatePolicies(model);
    
    // Assert cost exceeded
    const hasCostExceeded = findings.some(f => f.title === 'Policy Violation: Cost Budget Exceeded');
    assert.strictEqual(hasCostExceeded, true, 'String policies should validate budget cost limit constraints');

    // Assert retry calls exceeded
    const hasCallsExceeded = findings.some(f => f.title === 'Policy Violation: Max Tool Calls Exceeded');
    assert.strictEqual(hasCallsExceeded, true, 'String policies should validate execution loop call constraints');
  });

});
