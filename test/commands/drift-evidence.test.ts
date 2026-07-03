import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { driftCommand } from '../../src/commands/drift.js';

const ROOT = path.resolve(import.meta.dirname, '../../');

function writeTempFile(name: string, content: string): string {
  const tmpPath = path.resolve(ROOT, `test-drift-temp-${name}`);
  fs.writeFileSync(tmpPath, content, 'utf8');
  return tmpPath;
}

function writeTempJson(name: string, content: any): string {
  return writeTempFile(name + '.json', JSON.stringify(content, null, 2));
}

function cleanup(...paths: string[]) {
  paths.forEach((p) => {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  });
}

async function runDriftInProcess(options: {
  input: string;
  evidence?: string;
  traces?: string;
  failOn?: string;
}): Promise<{ exitCode: number; logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  
  const originalLog = console.log;
  const originalError = console.error;
  
  console.log = (...args: any[]) => { logs.push(args.join(' ')); };
  console.error = (...args: any[]) => { errors.push(args.join(' ')); };
  
  try {
    const exitCode = await driftCommand(options);
    return { exitCode, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test('Drift Evidence & Severity Gating Test Suite', async (t) => {
  const designModelYaml = `
system: payment-system
version: 1.0.0
models:
  - id: gpt-4
    provider: openai
    risk: low
agents:
  - id: payout-agent
    purpose: payout tool handler
    model: gpt-4
    allowed_tools: [send-payout]
tools:
  - id: send-payout
    type: payment
    risk: critical
    requires_human_approval: true
`;

  await t.test('1. Passes on conforming runtime evidence', async () => {
    const modelFile = writeTempFile('model1.yaml', designModelYaml);
    const evidence = {
      system: 'payment-system',
      observed_at: new Date().toISOString(),
      source: 'otel',
      observed_agents: [{ agent_id: 'payout-agent', trace_id: 't1', span_id: 's1' }],
      observed_tool_calls: [{ agent_id: 'payout-agent', tool_id: 'send-payout', trace_id: 't1', span_id: 's2' }],
      observed_approval_events: [{ agent_id: 'payout-agent', tool_id: 'send-payout', approver: 'admin', decision: 'approved', trace_id: 't1', span_id: 's3' }]
    };
    const evidenceFile = writeTempJson('evidence1', evidence);

    try {
      const res = await runDriftInProcess({
        input: modelFile,
        evidence: evidenceFile,
        failOn: 'critical'
      });
      assert.strictEqual(res.exitCode, 0, 'should return exit code 0');
      assert.match(res.logs.join('\n'), /drift gate passed/i, 'should pass conforming evidence checks');
    } finally {
      cleanup(modelFile, evidenceFile);
    }
  });

  await t.test('2. Fails severity CRITICAL when critical tool lacks approval', async () => {
    const modelFile = writeTempFile('model2.yaml', designModelYaml);
    const evidence = {
      system: 'payment-system',
      observed_at: new Date().toISOString(),
      source: 'otel',
      observed_agents: [{ agent_id: 'payout-agent', trace_id: 't1', span_id: 's1' }],
      observed_tool_calls: [{ agent_id: 'payout-agent', tool_id: 'send-payout', trace_id: 't1', span_id: 's2' }]
    };
    const evidenceFile = writeTempJson('evidence2', evidence);

    try {
      const res = await runDriftInProcess({
        input: modelFile,
        evidence: evidenceFile,
        failOn: 'critical'
      });
      assert.strictEqual(res.exitCode, 1, 'should fail with exit code 1');
      assert.match(res.errors.join('\n'), /missing_human_approval/i);
    } finally {
      cleanup(modelFile, evidenceFile);
    }
  });

  await t.test('3. Evaluates threshold gates correctly (--fail-on critical vs. high)', async () => {
    const modelFile = writeTempFile('model3.yaml', designModelYaml);
    const evidence = {
      system: 'payment-system',
      observed_at: new Date().toISOString(),
      source: 'otel',
      observed_agents: [{ agent_id: 'payout-agent', trace_id: 't1', span_id: 's1' }],
      observed_tool_calls: [{ agent_id: 'payout-agent', tool_id: 'unauthorized-hack-tool', trace_id: 't1', span_id: 's2' }]
    };
    const evidenceFile = writeTempJson('evidence3', evidence);

    try {
      // Should pass with --fail-on critical because the violation is HIGH, not CRITICAL
      const res1 = await runDriftInProcess({
        input: modelFile,
        evidence: evidenceFile,
        failOn: 'critical'
      });
      assert.strictEqual(res1.exitCode, 0);
      assert.match(res1.errors.join('\n'), /violation/i, 'should print warnings about high violation to stderr');
      assert.match(res1.logs.join('\n'), /drift gate passed/i, 'should still pass the gate');

      // Should fail with --fail-on high
      const res2 = await runDriftInProcess({
        input: modelFile,
        evidence: evidenceFile,
        failOn: 'high'
      });
      assert.strictEqual(res2.exitCode, 1, 'should block execution when threshold is high');
      assert.match(res2.errors.join('\n'), /drift gate failed/i);
    } finally {
      cleanup(modelFile, evidenceFile);
    }
  });
});
