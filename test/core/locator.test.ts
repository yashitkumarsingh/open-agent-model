import { test } from 'node:test';
import assert from 'node:assert';
import { findLineNumber } from '../../src/core/locator.js';

test('Core Locator Test Suite', async (t) => {

  await t.test('1. Source Line Mapper & SARIF Line Accuracy', () => {
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
