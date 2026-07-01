import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('CLI Process Integrations & Commands Test Suite', async (t) => {

  await t.test('1. validate and risk commands', () => {
    // Assert oam validate command parses default configs successfully (exits 0)
    const validateOut = execSync('node dist/index.js validate -i agentmodel.yaml', { encoding: 'utf8' });
    assert.match(validateOut, /is VALID/, 'Default config validate should succeed');

    const validateAsOfOut = execSync('node dist/index.js validate -i agentmodel.yaml --as-of 2026-01-01', { encoding: 'utf8' });
    assert.match(validateAsOfOut, /is VALID/, 'Validate command should accept deterministic --as-of dates');

    // Assert oam risk command blocks invalid configurations (exits with error code 1)
    assert.throws(() => {
      execSync('node dist/index.js risk -i examples/dodgy-agent.yaml --fail-on high', { stdio: 'pipe' });
    }, /Command failed/, 'Dodgy configurations must fail the static risk scan gate');
  });

  await t.test('2. drift and diagram commands', () => {
    // Assert drift command runs and fails with the example dodgy trace
    assert.throws(() => {
      execSync('node dist/index.js drift -i agentmodel.yaml -t examples/drift-traces.json', { stdio: 'pipe' });
    }, /Command failed/, 'Drift analyzer must fail on unauthorized traces');

    // Assert diagram command generates output file successfully
    const diagramOut = execSync('node dist/index.js diagram -i agentmodel.yaml', { encoding: 'utf8' });
    assert.match(diagramOut, /Successfully rendered/, 'Diagram generation should output a success log');
  });

  await t.test('3. report command exports audit-grade ABOM metadata', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oam-report-'));

    try {
      const reportOut = execSync(`node dist/index.js report -i agentmodel.yaml -d ${outputDir}`, { encoding: 'utf8' });
      assert.match(reportOut, /Successfully generated OpenAgentModel Governance Pack/, 'Report generation should succeed');

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
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

});
