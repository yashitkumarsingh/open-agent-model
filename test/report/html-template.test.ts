import { test } from 'node:test';
import assert from 'node:assert';
import { generateHtmlReport } from '../../src/report/html-template.js';
import { SystemModel } from '../../src/core/model.js';
import type { Finding } from '../../src/risk-engine/rules/index.js';

test('HTML Report Template Test Suite', async (t) => {
  await t.test('1. Renders low-risk empty-state dashboard branches', () => {
    const model: SystemModel = {
      system: 'empty-system',
      version: '1.0',
      agents: []
    };

    const html = generateHtmlReport(model, '<svg></svg>', [], '', { bomFormat: 'OpenAgentModel-AgentBOM' });

    assert.match(html, /LOW/);
    assert.match(html, /No static risks detected/);
    assert.match(html, /0 <span style="font-size: 14px; font-weight: 500; color: var\(--text-muted\);">Agents<\/span>/);
    assert.match(html, /0 Tools, 0 MCP Boundary Servers/);
    assert.match(html, /Fully Autonomous/);
    assert.match(html, /Fully Protected/);
    assert.match(html, /Secure/);
  });

  await t.test('2. Renders populated high-risk dashboard branches', () => {
    const model: SystemModel = {
      system: 'populated-system',
      version: '1.0',
      agents: [
        {
          id: 'approval-agent',
          purpose: 'Handles approved work',
          autonomy: 'human-approval-required',
          framework: 'langgraph',
          allowed_tools: ['critical-payout', 'medium-api', 'low-reader'],
          allowed_delegates: ['delegate-agent'],
          memory: {
            type: 'vector',
            contains: ['customer-pii'],
            write_access: true,
            poisoning_protection: true
          }
        },
        {
          id: 'delegate-agent',
          purpose: 'Delegate work',
          autonomy: 'supervised',
          memory: {
            type: 'cache',
            poisoning_protection: false
          }
        }
      ],
      tools: [
        {
          id: 'critical-payout',
          type: 'payment_api',
          risk: 'critical',
          description: 'Move money',
          requires_human_approval: true,
          data_classes: ['customer-pii']
        },
        {
          id: 'medium-api',
          type: 'api',
          risk: 'medium'
        },
        {
          id: 'low-reader',
          type: 'api',
          risk: 'low'
        }
      ],
      mcp_servers: [
        {
          id: 'internal-mcp',
          trust_level: 'internal',
          exposes: ['low-reader']
        },
        {
          id: 'external-mcp',
          trust_level: 'external',
          exposes: ['medium-api']
        }
      ],
      data_classes: [
        {
          id: 'customer-pii',
          sensitivity: 'critical',
          classification: 'pii'
        }
      ]
    };
    const findings: Finding[] = [
      makeFinding('R-001-ESC', 'critical', 'approval-agent'),
      makeFinding('R-002-AUT', 'critical', 'approval-agent'),
      makeFinding('R-003-EXF', 'high', 'approval-agent'),
      makeFinding('R-004-POI', 'medium', 'delegate-agent'),
      makeFinding('R-005-MISS', 'low', 'delegate-agent')
    ];

    const html = generateHtmlReport(model, '<svg></svg>', findings, '# policies', { agents: model.agents });

    assert.match(html, /CRITICAL/);
    assert.match(html, /Security Findings \(5\)/);
    assert.match(html, /approval-agent/);
    assert.match(html, /critical-payout/);
    assert.match(html, /medium-api/);
    assert.match(html, /low-reader/);
    assert.match(html, /Standardised/);
    assert.match(html, /Partial Protection/);
    assert.match(html, /Escalations Detected/);
    assert.match(html, /External MCPS/);
  });
});

function makeFinding(id: string, severity: Finding['severity'], agentId: string): Finding {
  return {
    id,
    title: `${id} finding`,
    severity,
    agentId,
    description: `${id} description`,
    recommendation: `${id} recommendation`,
    owaspMapping: 'OWASP-test'
  };
}
