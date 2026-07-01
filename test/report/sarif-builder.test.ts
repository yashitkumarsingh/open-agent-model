import { test } from 'node:test';
import assert from 'node:assert';
import { generateSarifReport } from '../../src/report/sarif-builder.js';
import { Finding } from '../../src/risk-engine/rules.js';

test('SARIF Builder Test Suite', async (t) => {
  await t.test('1. Preserves full finding rule IDs', () => {
    const findings: Finding[] = [
      {
        id: 'R-009-MCP-SIDE-EFFECT',
        title: 'External MCP Exposes Write or Payout Tool',
        severity: 'critical',
        agentId: 'system',
        description: 'External MCP exposes a side-effecting tool.',
        recommendation: 'Move the tool behind an internal MCP boundary.',
        owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
        context: { toolId: 'write-tool' }
      }
    ];

    const sarif = JSON.parse(generateSarifReport(findings, 'agentmodel.yaml'));
    const ruleId = sarif.runs[0].tool.driver.rules[0].id;
    const resultRuleId = sarif.runs[0].results[0].ruleId;

    assert.strictEqual(ruleId, 'R-009-MCP-SIDE-EFFECT');
    assert.strictEqual(resultRuleId, 'R-009-MCP-SIDE-EFFECT');
  });
});
