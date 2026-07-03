import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { observeCommand } from '../../src/commands/observe.js';

const ROOT = path.resolve(import.meta.dirname, '../../');

function writeTempTraces(name: string, content: any): string {
  const tmpPath = path.resolve(ROOT, `test-traces-temp-${name}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(content, null, 2), 'utf8');
  return tmpPath;
}

function writeTempTracesJsonl(name: string, content: any[]): string {
  const tmpPath = path.resolve(ROOT, `test-traces-temp-${name}.jsonl`);
  const lines = content.map((line) => JSON.stringify(line)).join('\n');
  fs.writeFileSync(tmpPath, lines, 'utf8');
  return tmpPath;
}

function cleanup(...paths: string[]) {
  paths.forEach((p) => {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  });
}

test('Observe Command Test Suite', async (t) => {
  await t.test('1. Ingests OTel JSON traces array into Runtime Evidence schema format', async () => {
    const traces = [
      {
        name: 'agent.tool_call',
        traceId: 't-123',
        spanId: 's-456',
        timestamp: '2026-07-03T12:00:00Z',
        attributes: {
          'gen_ai.agent.id': 'coder',
          'gen_ai.tool.id': 'write_file',
          'gen_ai.tool.mcp_server': 'filesystem-mcp'
        }
      },
      {
        name: 'agent.delegate',
        traceId: 't-123',
        spanId: 's-789',
        attributes: {
          'gen_ai.agent.id': 'coder',
          'gen_ai.delegate.id': 'tester'
        }
      },
      {
        name: 'agent.model_call',
        traceId: 't-123',
        spanId: 's-999',
        attributes: {
          'gen_ai.agent.id': 'coder',
          'gen_ai.model.id': 'gpt-4'
        }
      }
    ];

    const tracesFile = writeTempTraces('json1', traces);
    const outFile = path.resolve(ROOT, 'test-evidence-out1.json');

    try {
      const code = await observeCommand({
        traces: tracesFile,
        out: outFile,
        system: 'custom-system'
      });
      assert.strictEqual(code, 0, 'observeCommand should exit with 0');

      const content = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert.strictEqual(content.system, 'custom-system');
      assert.strictEqual(content.source, 'otel');
      assert.ok(Array.isArray(content.observed_agents), 'should contain observed agents');
      assert.strictEqual(content.observed_tool_calls.length, 1);
      assert.strictEqual(content.observed_tool_calls[0].tool_id, 'write_file');
      assert.strictEqual(content.observed_mcp_calls.length, 1);
      assert.strictEqual(content.observed_mcp_calls[0].mcp_server_id, 'filesystem-mcp');
      assert.strictEqual(content.observed_delegations.length, 1);
      assert.strictEqual(content.observed_delegations[0].delegate_id, 'tester');
      assert.strictEqual(content.observed_model_calls.length, 1);
      assert.strictEqual(content.observed_model_calls[0].model_id, 'gpt-4');
    } finally {
      cleanup(tracesFile, outFile);
    }
  });

  await t.test('2. Ingests OTel JSONL format streams successfully', async () => {
    const traces = [
      {
        name: 'agent.data_access',
        traceId: 't-111',
        spanId: 's-222',
        attributes: {
          'gen_ai.agent.id': 'coder',
          'gen_ai.data_class.id': 'credentials',
          'gen_ai.data_access.type': 'read'
        }
      },
      {
        name: 'agent.approval',
        traceId: 't-111',
        spanId: 's-333',
        attributes: {
          'gen_ai.agent.id': 'coder',
          'gen_ai.tool.id': 'payment',
          'gen_ai.approval.approver': 'manager-1',
          'gen_ai.approval.decision': 'approved'
        }
      }
    ];

    const tracesFile = writeTempTracesJsonl('jsonl1', traces);
    const outFile = path.resolve(ROOT, 'test-evidence-out2.json');

    try {
      const code = await observeCommand({
        traces: tracesFile,
        out: outFile
      });
      assert.strictEqual(code, 0);

      const content = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert.strictEqual(content.system, 'ObservedAgenticSystem');
      assert.strictEqual(content.observed_data_access.length, 1);
      assert.strictEqual(content.observed_data_access[0].data_class_id, 'credentials');
      assert.strictEqual(content.observed_data_access[0].access_type, 'read');
      assert.strictEqual(content.observed_approval_events.length, 1);
      assert.strictEqual(content.observed_approval_events[0].decision, 'approved');
    } finally {
      cleanup(tracesFile, outFile);
    }
  });
});
