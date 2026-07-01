import { test } from 'node:test';
import assert from 'node:assert';
import { runRiskChecks } from '../../src/risk-engine/rules.js';
import { SystemModel } from '../../src/core/model.js';

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
          sensitivity: 'high',
          classification: 'pii',
        }
      ],
      mcp_servers: [
        {
          id: 'external-vendor-mcp',
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

  await t.test('4. Structured approval modes satisfy dangerous tool gate', () => {
    const model: SystemModel = {
      system: 'approval-mode-test',
      version: '1.0',
      agents: [
        {
          id: 'supervised-agent',
          purpose: 'Testing',
          autonomy: 'supervised',
          allowed_tools: ['issue-refund']
        }
      ],
      tools: [
        {
          id: 'issue-refund',
          type: 'payment_api',
          risk: 'critical',
          approval: {
            mode: 'human'
          }
        }
      ]
    };

    const findings = runRiskChecks(model);
    const hasUnapprovedDangerous = findings.some(f => f.id.includes('R-002'));
    assert.strictEqual(hasUnapprovedDangerous, false, 'Structured tool approval modes should satisfy R-002');
  });

  await t.test('5. Governance hardening catches auth, approval, MCP, model, and autonomy gaps', () => {
    const model: SystemModel = {
      system: 'governance-hardening-test',
      version: '1.0',
      models: [
        {
          id: 'retention-model',
          provider: 'external-ai',
          allowed_for: ['pii-agent'],
          data_retention: 'enabled',
          risk: 'high'
        }
      ],
      identities: [
        {
          id: 'ownerless-sa',
          type: 'service_account',
          scopes: ['payments.write']
        }
      ],
      agents: [
        {
          id: 'pii-agent',
          purpose: 'Handle PII',
          model: 'retention-model',
          autonomy: 'supervised',
          allowed_tools: ['pii-reader']
        },
        {
          id: 'autonomous-agent',
          purpose: 'Run commands',
          autonomy: 'autonomous',
          allowed_tools: ['shell-tool']
        },
        {
          id: 'confused-agent',
          purpose: 'Ambiguous policy',
          allowed_tools: ['shell-tool'],
          denied_tools: ['shell-tool']
        },
        {
          id: 'cycle-a',
          purpose: 'Cycle A',
          allowed_delegates: ['cycle-b']
        },
        {
          id: 'cycle-b',
          purpose: 'Cycle B',
          allowed_delegates: ['cycle-a']
        }
      ],
      tools: [
        {
          id: 'critical-no-auth',
          type: 'payment_api',
          risk: 'critical',
          side_effect: 'payout'
        },
        {
          id: 'critical-ownerless',
          type: 'payment_api',
          risk: 'critical',
          side_effect: 'payout',
          auth_identity: 'ownerless-sa',
          rate_limit: { max_calls_per_task: 1 },
          approval: {
            mode: 'human',
            expiry_seconds: 7200
          }
        },
        {
          id: 'external-write',
          type: 'api',
          risk: 'medium',
          side_effect: 'external_write'
        },
        {
          id: 'shell-tool',
          type: 'command_line',
          risk: 'medium',
          side_effect: 'system_alteration'
        },
        {
          id: 'pii-reader',
          type: 'api',
          risk: 'low',
          data_classes: ['customer-pii']
        }
      ],
      data_classes: [
        {
          id: 'customer-pii',
          sensitivity: 'critical',
          classification: 'pii'
        }
      ],
      mcp_servers: [
        {
          id: 'vendor-mcp',
          trust_level: 'external',
          exposes: ['external-write']
        }
      ]
    };

    const findings = runRiskChecks(model);
    const ids = new Set(findings.map((finding) => finding.id));

    assert.strictEqual(ids.has('R-006-AUTH'), true, 'High-impact tools without auth identity should be flagged');
    assert.strictEqual(ids.has('R-006-RATE'), true, 'High-impact tools without rate limit should be flagged');
    assert.strictEqual(ids.has('R-006-OWNER'), true, 'Ownerless identities used by high-impact tools should be flagged');
    assert.strictEqual(ids.has('R-006-APPROVER'), true, 'Human approval without approver role should be flagged');
    assert.strictEqual(ids.has('R-006-APPROVAL-EXPIRY'), true, 'Missing or long approval expiry should be flagged');
    assert.strictEqual(ids.has('R-006-MCP-SIDE-EFFECT'), true, 'External MCP write/payout exposure should be flagged');
    assert.strictEqual(ids.has('R-006-MODEL-RETENTION'), true, 'PII handling with retention-enabled model should be flagged');
    assert.strictEqual(ids.has('R-006-MODEL-RISK'), true, 'High-risk model with high-sensitivity data should be flagged');
    assert.strictEqual(ids.has('R-006-ALLOW-DENY'), true, 'Allowed and denied same tool should be flagged');
    assert.strictEqual(ids.has('R-006-DELEGATION-CYCLE'), true, 'Delegation cycles should be flagged');
    assert.strictEqual(ids.has('R-006-AUTONOMOUS-WRITE'), true, 'Autonomous command/write tools should be flagged');
  });

});
