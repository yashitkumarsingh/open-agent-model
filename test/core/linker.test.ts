import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup ES module filename resolver
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import components directly
import { validateYaml } from '../../src/commands/validate.js';

test('Core Linker Test Suite', async (t) => {

  await t.test('1. Schema Validation (Success & Failures)', () => {
    // Valid model check
    const validRes = validateYaml(path.resolve(__dirname, '../../agentmodel.yaml'));
    assert.strictEqual(validRes.valid, true, 'Default agentmodel.yaml should be valid');

    // Invalid model check (missing system title)
    const invalidYaml = `
version: "0.1"
agents:
  - id: test-agent
    purpose: "Test"
`;
    const tempFile = path.resolve(__dirname, 'temp-invalid.yaml');
    fs.writeFileSync(tempFile, invalidYaml, 'utf8');
    try {
      const invalidRes = validateYaml(tempFile);
      assert.strictEqual(invalidRes.valid, false, 'Model missing system title should fail validation');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('2. Referential Linker Checks', () => {
    // Missing tool linking
    const invalidToolYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
    allowed_tools:
      - missing-tool
`;
    // Missing delegate linking
    const invalidDelegateYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
    allowed_delegates:
      - missing-agent
`;
    const tempFile = path.resolve(__dirname, 'temp-linker.yaml');
    
    // Test missing tool
    fs.writeFileSync(tempFile, invalidToolYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Linking to missing tool should fail referential checks');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    // Test missing delegate
    fs.writeFileSync(tempFile, invalidDelegateYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Linking to missing delegate should fail referential checks');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('3. Strict Schema and Catalog Link Checks', () => {
    const typoYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
tools:
  - id: payout-api
    type: payment_api
    requires_human_aproval: true
`;
    const missingIdentityYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
tools:
  - id: payout-api
    type: payment_api
    auth_identity: missing-sa
`;
    const missingModelAgentYaml = `
system: test-system
version: "1.0"
models:
  - id: model-a
    provider: openai
    risk: medium
    allowed_for: [missing-agent]
agents:
  - id: agent-a
    purpose: "Test"
`;
    const tempFile = path.resolve(__dirname, 'temp-catalog.yaml');

    fs.writeFileSync(tempFile, typoYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Unknown schema fields should fail validation');
      assert.match(res.errors?.join('\n') || '', /additional properties/, 'Validation should explain the unknown field');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    fs.writeFileSync(tempFile, missingIdentityYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Tools must reference defined auth identities');
      assert.match(res.errors?.join('\n') || '', /auth_identity 'missing-sa'/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    fs.writeFileSync(tempFile, missingModelAgentYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Model allowed_for entries must reference defined agents');
      assert.match(res.errors?.join('\n') || '', /allowed_for agent 'missing-agent'/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('4. Duplicate ID and Identity Expiry Checks', () => {
    const duplicateIdYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
tools:
  - id: shared-tool
    type: api
  - id: shared-tool
    type: database
`;
    const expiredIdentityYaml = `
system: test-system
version: "1.0"
identities:
  - id: expired-sa
    type: service_account
    expires_at: "2000-01-01T00:00:00Z"
agents:
  - id: agent-a
    purpose: "Test"
`;
    const tempFile = path.resolve(__dirname, 'temp-semantic.yaml');

    fs.writeFileSync(tempFile, duplicateIdYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Duplicate IDs should fail semantic validation');
      assert.match(res.errors?.join('\n') || '', /Duplicate ID Error: Tool id 'shared-tool'/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    fs.writeFileSync(tempFile, expiredIdentityYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Expired identities should fail semantic validation');
      assert.match(res.errors?.join('\n') || '', /expired credentials/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

});
