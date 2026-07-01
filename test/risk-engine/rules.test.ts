import { test } from 'node:test';
import assert from 'node:assert';
import { runRiskChecks } from '../../dist/risk-engine/rules.js';
import { SystemModel } from '../../dist/core/model.js';

test('Risk Engine Rules Test Suite', async (t) => {

  await t.test('1. Transitive Graph A2A Privilege Escalation', () => {
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

  await t.test('2. Static Risk Engine Rule Sets', () => {
    const model: SystemModel = {
      system: 'rule-test',
      version: '1.0',
      agents: [
        {
          id: 'agent-a',
          purpose: 'Test',
          memory: {
            type: 'vector',
            write_access: true,
            poisoning_protection: false // Violation: Missing poisoning protection (R-004)
          },
          retry_policy: {
            max_retries: 25, // Violation: Excessive retries (R-005)
            loop_detection: false // Violation: Loop detection disabled
          }
        }
      ]
    };

    const findings = runRiskChecks(model);
    
    const hasPoisoningViolation = findings.some(f => f.id.includes('R-004-POI'));
    assert.strictEqual(hasPoisoningViolation, true, 'Risk engine should catch missing memory poisoning protection configurations');

    const hasRetryViolation = findings.some(f => f.id.includes('R-005-MAX'));
    assert.strictEqual(hasRetryViolation, true, 'Risk engine should catch excessive retry limit thresholds');

    const hasLoopViolation = findings.some(f => f.id.includes('R-005-LOOP'));
    assert.strictEqual(hasLoopViolation, true, 'Risk engine should catch disabled execution loop protections');
  });

  await t.test('3. Extended Risk Engine Rules (R-002 & R-003)', () => {
    const model: SystemModel = {
      system: 'extended-rules-test',
      version: '1.0',
      agents: [
        {
          id: 'rogue-agent',
          purpose: 'Testing',
          autonomy: 'autonomous', // R-002 violation: autonomous calling high risk tool without explicit approval
          allowed_tools: ['delete-db', 'pii-extractor']
        }
      ],
      tools: [
        {
          id: 'delete-db',
          type: 'database',
          risk: 'high',
          requires_human_approval: false
        },
        {
          id: 'pii-extractor',
          type: 'api',
          risk: 'medium',
          data_classes: ['customer-pii'] // PII
        }
      ],
      data_classes: [
        {
          id: 'customer-pii',
          classification: 'pii',
          description: 'PII data'
        }
      ],
      mcp_servers: [
        {
          id: 'external-vendor-mcp',
          uri: 'https://vendor.example.com/mcp',
          trust_level: 'external', // R-003 violation: PII connected to external MCP
          exposes: ['pii-extractor'] 
        }
      ]
    };

    const findings = runRiskChecks(model);
    
    // R-002
    const hasUnapprovedDangerous = findings.some(f => f.id.includes('R-002'));
    assert.strictEqual(hasUnapprovedDangerous, true, 'Risk engine should catch autonomous execution of high-risk tools');

    // R-003
    const hasPiiExfiltration = findings.some(f => f.id.includes('R-003'));
    assert.strictEqual(hasPiiExfiltration, true, 'Risk engine should catch PII exfiltration via external MCP boundaries');
  });

});
