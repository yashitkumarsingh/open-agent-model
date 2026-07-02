import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Import command handlers directly from source logic
import { validateCommand } from '../../src/commands/validate.js';
import { riskCommand } from '../../src/commands/risk.js';
import { driftCommand } from '../../src/commands/drift.js';
import { diagramCommand } from '../../src/commands/diagram.js';
import { reportCommand } from '../../src/commands/report.js';

interface MockResult {
  exitCode: number;
  logs: string[];
  errors: string[];
}

async function executeCommand(fn: () => number | Promise<number>): Promise<MockResult> {
  const originalLog = console.log;
  const originalError = console.error;

  const logs: string[] = [];
  const errors: string[] = [];

  console.log = (...args: unknown[]) => {
    logs.push(args.join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.join(' '));
  };

  let exitCode = 0;
  try {
    exitCode = await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { exitCode, logs, errors };
}

test('CLI Process Integrations & Commands Test Suite', async (t) => {

  await t.test('1. validate and risk commands', async () => {
    // Assert validate command parses default configs successfully (exits 0)
    const validateRes = await executeCommand(() => validateCommand({ input: 'agentmodel.yaml' }));
    assert.strictEqual(validateRes.exitCode, 0, 'Default config validate should succeed (exit 0)');
    assert.match(validateRes.logs.join('\n'), /is VALID/, 'Logs should output validation success');

    const validateAsOfRes = await executeCommand(() => validateCommand({ input: 'agentmodel.yaml', asOf: '2026-01-01' }));
    assert.strictEqual(validateAsOfRes.exitCode, 0, 'Validate command should accept deterministic --as-of dates');
    assert.match(validateAsOfRes.logs.join('\n'), /is VALID/);

    // Assert risk command blocks invalid configurations (exits with error code 1)
    const riskRes = await executeCommand(() => riskCommand({ input: 'examples/dodgy-agent.yaml', failOn: 'high' }));
    assert.strictEqual(riskRes.exitCode, 1, 'Dodgy configurations must fail the static risk scan gate (exit 1)');
  });

  await t.test('2. drift and diagram commands', async () => {
    // Assert drift command runs and fails with the example dodgy trace
    const driftRes = await executeCommand(() => driftCommand({ input: 'agentmodel.yaml', traces: 'examples/drift-traces.json' }));
    assert.strictEqual(driftRes.exitCode, 1, 'Drift analyzer must fail on unauthorized traces');

    // Assert diagram command generates output file successfully
    const tempDiagram = path.join(os.tmpdir(), 'diagram-test.svg');
    try {
      const diagramRes = await executeCommand(() => diagramCommand({ input: 'agentmodel.yaml', output: tempDiagram }));
      assert.strictEqual(diagramRes.exitCode, 0, 'Should return exit code 0');
      assert.match(diagramRes.logs.join('\n'), /Successfully rendered/, 'Diagram generation should output a success log');
      assert.ok(fs.existsSync(tempDiagram));
    } finally {
      if (fs.existsSync(tempDiagram)) fs.unlinkSync(tempDiagram);
    }
  });

  await t.test('3. report command exports audit-grade ABOM metadata', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oam-report-'));

    try {
      const reportRes = await executeCommand(() => reportCommand({ input: 'agentmodel.yaml', dir: outputDir }));
      assert.strictEqual(reportRes.exitCode, 0, 'Should return exit code 0');
      assert.match(reportRes.logs.join('\n'), /Successfully generated OpenAgentModel Governance Pack/, 'Report generation should succeed');

      const abomPath = path.join(outputDir, 'agent-bom.json');
      const abom = JSON.parse(fs.readFileSync(abomPath, 'utf8'));
      assert.strictEqual(abom.bomFormat, 'OpenAgentModel-AgentBOM');
      assert.strictEqual(typeof abom.bomVersion, 'string');
      assert.strictEqual(typeof abom.schemaVersion, 'string');
      assert.strictEqual(abom.generatedBy.name, 'open-agent-model');
      assert.strictEqual(abom.sourceFile, 'agentmodel.yaml');
      assert.strictEqual(abom.sourceHash.algorithm, 'sha256');
      assert.match(abom.sourceHash.value, /^[a-f0-9]{64}$/);
      assert.strictEqual(typeof abom.ruleSetVersion, 'string');
      assert.ok(Array.isArray(abom.findings), 'ABOM should include risk findings');
      assert.ok(abom.riskSummary && typeof abom.riskSummary.totalFindings === 'number');

      // Assert Rego file exists and compiles package openagentmodel.governance
      const regoPath = path.join(outputDir, 'agent-policy.rego');
      assert.ok(fs.existsSync(regoPath), 'Rego policy file must be exported');
      const regoContent = fs.readFileSync(regoPath, 'utf8');
      assert.match(regoContent, /package openagentmodel\.governance/, 'Rego file should declare package');
      assert.match(regoContent, /R-002 Violation/, 'Rego file should compile R-002 rule');
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  await t.test('4. command failures and edge cases', async () => {
    // A. Validate command with missing file -> exits 1
    const validateFail = await executeCommand(() => validateCommand({ input: 'ghost-file.yaml' }));
    assert.strictEqual(validateFail.exitCode, 1, 'validateCommand should fail if target file is missing');
    assert.match(validateFail.errors.join('\n'), /File not found/, 'Error should indicate missing file');

    // B. Drift command with missing model path -> exits 1
    const driftMissingModel = await executeCommand(() => driftCommand({ input: 'ghost-model.yaml', traces: 'examples/drift-traces.json' }));
    assert.strictEqual(driftMissingModel.exitCode, 1);
    assert.match(driftMissingModel.errors.join('\n'), /Agent model file not found/);

    // C. Drift command with missing traces file -> exits 1
    const driftMissingTraces = await executeCommand(() => driftCommand({ input: 'agentmodel.yaml', traces: 'ghost-traces.json' }));
    assert.strictEqual(driftMissingTraces.exitCode, 1);
    assert.match(driftMissingTraces.errors.join('\n'), /traces log file not found/);

    // D. Drift command with malformed traces log format -> exits 1
    const tempMalformed = path.join(os.tmpdir(), 'malformed-traces.json');
    fs.writeFileSync(tempMalformed, '[invalid-json]', 'utf8');
    try {
      const driftMalformed = await executeCommand(() => driftCommand({ input: 'agentmodel.yaml', traces: tempMalformed }));
      assert.strictEqual(driftMalformed.exitCode, 1);
      assert.match(driftMalformed.errors.join('\n'), /Error checking trace file format/);
    } finally {
      if (fs.existsSync(tempMalformed)) fs.unlinkSync(tempMalformed);
    }

    // E. Drift command with valid and invalid JSONL trace stream mapping
    const tempJsonL = path.join(os.tmpdir(), 'traces.jsonl');
    
    // Case 1: Valid trace lines conforming to model
    const validJsonLContent = `
{"name": "agent.tool_call", "traceId": "t1", "spanId": "s1", "attributes": {"gen_ai.agent.id": "support-triage", "gen_ai.tool.id": "read-crm-data"}}
`;
    fs.writeFileSync(tempJsonL, validJsonLContent.trim(), 'utf8');
    try {
      const driftJsonLSuccess = await executeCommand(() => driftCommand({ input: 'agentmodel.yaml', traces: tempJsonL }));
      assert.strictEqual(driftJsonLSuccess.exitCode, 0, 'Conforming JSONL traces must pass drift check');
      assert.match(driftJsonLSuccess.logs.join('\n'), /DRIFT GATE PASSED/);
    } finally {
      if (fs.existsSync(tempJsonL)) fs.unlinkSync(tempJsonL);
    }

    // Case 2: Non-conforming trace lines (drift)
    const invalidJsonLContent = `
{"name": "agent.tool_call", "traceId": "t2", "spanId": "s2", "attributes": {"gen_ai.agent.id": "support-triage", "gen_ai.tool.id": "wildcard-unauthorized-tool"}}
{"name": "agent.delegate", "traceId": "t3", "spanId": "s3", "attributes": {"gen_ai.agent.id": "support-triage", "gen_ai.delegate.id": "admin-agent"}}
`;
    fs.writeFileSync(tempJsonL, invalidJsonLContent.trim(), 'utf8');
    try {
      const driftJsonLFail = await executeCommand(() => driftCommand({ input: 'agentmodel.yaml', traces: tempJsonL }));
      assert.strictEqual(driftJsonLFail.exitCode, 1, 'Non-conforming JSONL trace must trigger exit 1');
      const errText = driftJsonLFail.errors.join('\n');
      assert.match(errText, /DRIFT DETECTED/);
      assert.match(errText, /wildcard-unauthorized-tool/);
      assert.match(errText, /admin-agent/);
    } finally {
      if (fs.existsSync(tempJsonL)) fs.unlinkSync(tempJsonL);
    }

    // F. Diagram command validation failure -> exits 1
    const invalidYamlFile = path.join(os.tmpdir(), 'invalid-validate.yaml');
    fs.writeFileSync(invalidYamlFile, 'agents:\n  - purpose: missing-id', 'utf8');
    try {
      const diagramFail = await executeCommand(() => diagramCommand({ input: invalidYamlFile, output: 'diag.svg' }));
      assert.strictEqual(diagramFail.exitCode, 1);
      assert.match(diagramFail.errors.join('\n'), /Error validating agent model/);

      // Report command validation failure -> exits 1
      const reportFail = await executeCommand(() => reportCommand({ input: invalidYamlFile, dir: '.' }));
      assert.strictEqual(reportFail.exitCode, 1);
      assert.match(reportFail.errors.join('\n'), /Error validating agent model/);
    } finally {
      if (fs.existsSync(invalidYamlFile)) fs.unlinkSync(invalidYamlFile);
    }

    // G. Diagram command output path write error -> exits 1
    const diagramWriteFail = await executeCommand(() => diagramCommand({ input: 'agentmodel.yaml', output: '/non-existent-dir/diag.svg' }));
    assert.strictEqual(diagramWriteFail.exitCode, 1);
    assert.match(diagramWriteFail.errors.join('\n'), /Error saving SVG file/);
  });

});
