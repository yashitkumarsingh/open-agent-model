import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup ES module filename resolver
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import components directly
import { validateYaml } from '../dist/commands/validate.js';
import { runRiskChecks } from '../dist/risk-engine/rules.js';
import { generateSarifReport } from '../dist/report/sarif-builder.js';
import { findLineNumber } from '../dist/core/locator.js';
import { evaluatePolicies } from '../dist/risk-engine/policy-evaluator.js';
import { SystemModel } from '../dist/core/model.js';

test('OpenAgentModel System Test Suite', async (t) => {

  await t.test('1. Schema Validation', () => {
    // Valid model check
    const validRes = validateYaml(path.resolve(__dirname, '../agentmodel.yaml'));
    assert.strictEqual(validRes.valid, true, 'Default agentmodel.yaml should be valid');

    // Invalid model check (missing system title)
    const invalidYaml = `
version: "0.1"
agents:
  - id: test-agent
    purpose: "Test"
`;
    const tempFile = path.resolve(__dirname, 'temp-invalid.yaml');
    fs.writeFileSync(tempFile, invalidYaml, 'utf8');
    try {
      const invalidRes = validateYaml(tempFile);
      assert.strictEqual(invalidRes.valid, false, 'Model missing system title should fail validation');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('2. Referential Linker', () => {
    const invalidRefYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
    allowed_tools:
      - missing-tool
`;
    const tempFile = path.resolve(__dirname, 'temp-linker.yaml');
    fs.writeFileSync(tempFile, invalidRefYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Linking to missing tool should fail referential checks');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('3. Transitive Graph A2A Privilege Escalation', () => {
    // Multi-hop escalation: A -> B -> C -> critical tool
    const graphEscalationModel: SystemModel = {
      system: 'test-graph',
      version: '1.0',
      agents: [
        {
          id: 'agent-a',
          purpose: 'Triage',
          allowed_delegates: ['agent-b']
        },
        {
          id: 'agent-b',
          purpose: 'Router',
          allowed_delegates: ['agent-c']
        },
        {
          id: 'agent-c',
          purpose: 'Admin',
          allowed_tools: ['critical-tool']
        }
      ],
      tools: [
        {
          id: 'critical-tool',
          type: 'payment_api',
          risk: 'critical'
        }
      ]
    };

    const findings = runRiskChecks(graphEscalationModel);
    const hasEscalation = findings.some(f => f.id.includes('R-001-ESC') && f.agentId === 'agent-a');
    assert.strictEqual(hasEscalation, true, 'Transitive multi-hop privilege escalation path should be flagged for agent-a');
  });

  await t.test('4. Declarative Policy Engine', () => {
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

  await t.test('5. Source Line Mapper & SARIF Line Accuracy', () => {
    const rawYaml = `
system: sample-app
version: "1.0"
agents:
  - id: agent-a
    purpose: "Testing"
  - id: offending-agent
    purpose: "To be flagged"
`;
    const lineNum = findLineNumber(rawYaml, 'offending-agent');
    assert.strictEqual(lineNum, 7, 'Line mapper should return exact line number 7 for offending-agent ID');
  });

});
