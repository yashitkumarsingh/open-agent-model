import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

  await t.test('5b. Federated IAM Identity Pointer Checks', () => {
    const tempFile = path.resolve(__dirname, 'temp-federated-identity.yaml');

    // Case A: Missing provider_ref -> fail
    const missingRefYaml = `
system: test-system
version: "1.0"
identities:
  - id: bad-federation
    type: federated_role
agents:
  - id: agent-a
    purpose: "Test"
`;
    fs.writeFileSync(tempFile, missingRefYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'federated_role without provider_ref should fail');
      assert.match(res.errors?.join('\n') || '', /missing the 'provider_ref' field/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    // Case B: Invalid provider_ref prefix -> fail
    const invalidPrefixYaml = `
system: test-system
version: "1.0"
identities:
  - id: bad-prefix
    type: federated_role
    provider_ref: invalid-arn:aws:iam::role
agents:
  - id: agent-a
    purpose: "Test"
`;
    fs.writeFileSync(tempFile, invalidPrefixYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'federated_role with invalid provider_ref prefix should fail');
      assert.match(res.errors?.join('\n') || '', /invalid provider_ref/);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    // Case C: Valid prefix -> success
    const validYaml = `
system: test-system
version: "1.0"
identities:
  - id: good-federation
    type: federated_role
    provider_ref: arn:aws:iam::123456789012:role/MyAgentRole
agents:
  - id: agent-a
    purpose: "Test"
`;
    fs.writeFileSync(tempFile, validYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, true, 'federated_role with valid prefix should succeed');
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

  await t.test('8. Tool source.mcp_server must reference a declared mcp_servers entry', () => {
    const tempFile = path.resolve(__dirname, 'temp-source-linker.yaml');

    // Case A: source.mcp_server points to an undeclared server → must fail
    const missingServerYaml = `
system: source-test
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
    allowed_tools: [search-tool]
tools:
  - id: search-tool
    type: api
    source:
      kind: mcp
      mcp_server: ghost-mcp
mcp_servers:
  - id: real-mcp
    trust_level: internal
`;
    fs.writeFileSync(tempFile, missingServerYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'source.mcp_server pointing to undeclared server should fail validation');
      const errorText = res.errors?.join('\n') ?? '';
      assert.match(errorText, /source\.mcp_server.*ghost-mcp/, 'Error should name the missing mcp_server reference');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    // Case B: source.kind='mcp' with no mcp_server at all → must fail
    const missingFieldYaml = `
system: source-test-b
version: "1.0"
agents:
  - id: agent-b
    purpose: "Test"
    allowed_tools: [lookup-tool]
tools:
  - id: lookup-tool
    type: api
    source:
      kind: mcp
mcp_servers:
  - id: real-mcp
    trust_level: internal
`;
    fs.writeFileSync(tempFile, missingFieldYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'source.kind=mcp without mcp_server should fail validation');
      const errorText = res.errors?.join('\n') ?? '';
      assert.match(errorText, /source\.kind.*mcp.*missing.*source\.mcp_server|source\.mcp_server/, 'Error should flag the missing mcp_server field');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  await t.test('9. DataClass inherits_from validation and cycle detection', () => {
    const tempFile = path.join(os.tmpdir(), 'dc-inheritance-test.yaml');

    // Case A: Missing inherits_from target -> fail
    const missingTargetYaml = `
system: dc-test-a
version: "1.0"
agents:
  - id: agent-a
    purpose: "Test"
data_classes:
  - id: child-dc
    sensitivity: high
    classification: pii
    inherits_from: ghost-dc
`;
    fs.writeFileSync(tempFile, missingTargetYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Inheriting from undeclared data class should fail');
      assert.match(res.errors?.join('\n') ?? '', /inherits_from.*ghost-dc/, 'Error should mention the missing inherits_from class');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    // Case B: Inheritance cycle (A -> B -> A) -> fail
    const cycleYaml = `
system: dc-test-b
version: "1.0"
agents:
  - id: agent-b
    purpose: "Test"
data_classes:
  - id: class-a
    sensitivity: low
    classification: public
    inherits_from: class-b
  - id: class-b
    sensitivity: low
    classification: public
    inherits_from: class-a
`;
    fs.writeFileSync(tempFile, cycleYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, false, 'Inheritance cycle should fail validation');
      assert.match(res.errors?.join('\n') ?? '', /inheritance cycle detected/, 'Error should identify the inheritance cycle');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }

    // Case C: Valid chain (A -> B) -> success
    const validYaml = `
system: dc-test-c
version: "1.0"
agents:
  - id: agent-c
    purpose: "Test"
data_classes:
  - id: parent-dc
    sensitivity: high
    classification: pii
  - id: child-dc
    sensitivity: high
    classification: pii
    inherits_from: parent-dc
`;
    fs.writeFileSync(tempFile, validYaml, 'utf8');
    try {
      const res = validateYaml(tempFile);
      assert.strictEqual(res.valid, true, 'Valid inherits_from chain should pass validation');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

});
