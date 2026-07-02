import { test } from 'node:test';
import assert from 'node:assert';
import { generateSvgDiagram } from '../../src/commands/diagram.js';
import { SystemModel } from '../../src/core/model.js';

test('Diagram Renderer Test Suite', async (t) => {
  await t.test('1. Renders trust boundaries, tool links, data links, and risk highlights', () => {
    const model: SystemModel = {
      system: 'diagram-system',
      version: '1.0',
      agents: [
        {
          id: 'agent-a',
          purpose: 'Caller',
          autonomy: 'autonomous',
          allowed_tools: ['delete-db', 'pii-api'],
          allowed_delegates: ['agent-b']
        },
        {
          id: 'agent-b',
          purpose: 'Delegate',
          allowed_tools: ['payout-api']
        }
      ],
      tools: [
        {
          id: 'delete-db',
          type: 'database',
          risk: 'high'
        },
        {
          id: 'pii-api',
          type: 'api',
          risk: 'medium',
          data_classes: ['customer-pii']
        },
        {
          id: 'payout-api',
          type: 'payment_api',
          risk: 'critical',
          side_effect: 'payout'
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
          id: 'internal-mcp',
          trust_level: 'internal',
          exposes: ['delete-db']
        },
        {
          id: 'external-mcp',
          trust_level: 'external',
          exposes: ['pii-api']
        }
      ]
    };

    const svg = generateSvgDiagram(model);

    assert.match(svg, /UNTRUSTED \/ EXTERNAL ZONE/);
    assert.match(svg, /INTERNAL SECURE ZONE/);
    assert.match(svg, /external-mcp/);
    assert.match(svg, /agent-a/);
    assert.match(svg, /payout-api/);
    assert.match(svg, /customer-pii/);
    assert.match(svg, /arrow-danger/);
    assert.match(svg, /Privilege Escalation \/ Threat Path/);
  });
});
