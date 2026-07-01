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

  await t.test('5. Identity Expiry Checks Support Deterministic Validation Dates', () => {
    const datedIdentityYaml = `
system: test-system
version: "1.0"
identities:
  - id: short-lived-sa
    type: service_account
    expires_at: "2026-01-01T00:00:00Z"
agents:
  - id: agent-a
    purpose: "Test"
`;
    const tempFile = path.resolve(__dirname, 'temp-as-of.yaml');

    fs.writeFileSync(tempFile, datedIdentityYaml, 'utf8');
    try {
      const beforeExpiry = validateYaml(tempFile, { asOf: '2025-12-31T00:00:00Z' });
      assert.strictEqual(beforeExpiry.valid, true, 'Identity should be valid before its deterministic expiry date');

      const afterExpiry = validateYaml(tempFile, { asOf: '2026-07-01' });
      assert.strictEqual(afterExpiry.valid, false, 'Identity should be expired after its deterministic expiry date');
      assert.match(afterExpiry.errors?.join('\n') || '', /expired credentials/);

      const invalidDate = validateYaml(tempFile, { asOf: 'not-a-date' });
      assert.strictEqual(invalidDate.valid, false, 'Invalid --as-of dates should fail validation');
      assert.match(invalidDate.errors?.join('\n') || '', /Invalid --as-of value/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('6. Agent Model Binding and Identity Scope Checks', () => {
    const disallowedModelYaml = `
system: test-system
version: "1.0"
models:
  - id: model-a
    provider: openai
    risk: medium
    allowed_for: [other-agent]
agents:
  - id: agent-a
    purpose: "Test"
    model: model-a
  - id: other-agent
    purpose: "Other"
`;
    const missingScopeYaml = `
system: test-system
version: "1.0"
identities:
  - id: refund-sa
    type: service_account
    scopes: [crm.read]
agents:
  - id: agent-a
    purpose: "Test"
tools:
  - id: issue-refund
    type: payment_api
    auth_identity: refund-sa
    required_scopes: [refund.write]
`;
    const missingAuthForScopeYaml = `
system: test-system
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
tools:
  - id: issue-refund
    type: payment_api
    required_scopes: [refund.write]
`;
    const tempFile = path.resolve(__dirname, 'temp-binding.yaml');

    fs.writeFileSync(tempFile, disallowedModelYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Agent model bindings must be allowed by model.allowed_for');
      assert.match(res.errors?.join('\n') || '', /does not include the agent in 'allowed_for'/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    fs.writeFileSync(tempFile, missingScopeYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Tool required scopes must be granted by the bound identity');
      assert.match(res.errors?.join('\n') || '', /requires scope 'refund.write'/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    fs.writeFileSync(tempFile, missingAuthForScopeYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Tools with required scopes must declare auth_identity');
      assert.match(res.errors?.join('\n') || '', /declares required_scopes but has no auth_identity/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('7. Duplicate Reference Lists Are Rejected', () => {
    const duplicateReferenceYaml = `
system: test-system
version: "1.0"
models:
  - id: model-a
    provider: openai
    risk: medium
    allowed_for: [agent-a, agent-a]
identities:
  - id: app-sa
    type: service_account
    scopes: [crm.read, crm.read]
agents:
  - id: agent-a
    purpose: "Test"
    model: model-a
    memory:
      type: vector
      contains: [customer-pii, customer-pii]
    allowed_tools: [read-crm, read-crm]
    denied_tools: [blocked-tool, blocked-tool]
    approval_required_for: [read-crm, read-crm]
    allowed_delegates: [agent-b, agent-b]
  - id: agent-b
    purpose: "Delegate"
tools:
  - id: read-crm
    type: api
    auth_identity: app-sa
    required_scopes: [crm.read, crm.read]
    data_classes: [customer-pii, customer-pii]
  - id: blocked-tool
    type: api
mcp_servers:
  - id: internal-mcp
    trust_level: internal
    exposes: [read-crm, read-crm]
data_classes:
  - id: customer-pii
    sensitivity: high
    classification: pii
`;
    const tempFile = path.resolve(__dirname, 'temp-duplicate-refs.yaml');

    fs.writeFileSync(tempFile, duplicateReferenceYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      const errors = res.errors?.join('\n') || '';
      assert.strictEqual(res.valid, false, 'Duplicate reference list entries should fail semantic validation');
      assert.match(errors, /Agent 'agent-a'.*allowed_tools/);
      assert.match(errors, /Agent 'agent-a'.*denied_tools/);
      assert.match(errors, /Agent 'agent-a'.*approval_required_for/);
      assert.match(errors, /Agent 'agent-a'.*allowed_delegates/);
      assert.match(errors, /Agent 'agent-a' memory.*contains/);
      assert.match(errors, /Tool 'read-crm'.*required_scopes/);
      assert.match(errors, /Tool 'read-crm'.*data_classes/);
      assert.match(errors, /Model 'model-a'.*allowed_for/);
      assert.match(errors, /Identity 'app-sa'.*scopes/);
      assert.match(errors, /MCP Server 'internal-mcp'.*exposes/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

});
