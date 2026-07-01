import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';

test('CLI Process Integrations & Commands Test Suite', async (t) => {

  await t.test('1. validate and risk commands', () => {
    // Assert oam validate command parses default configs successfully (exits 0)
    const validateOut = execSync('node dist/index.js validate -i agentmodel.yaml', { encoding: 'utf8' });
    assert.match(validateOut, /is VALID/, 'Default config validate should succeed');

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

});
