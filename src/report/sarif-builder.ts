import fs from 'fs';
import { Finding } from '../risk-engine/rules.js';
import { findLineNumber } from '../core/locator.js';
import { getPackageVersion } from '../core/version.js';

function getSarifRuleId(findingId: string): string {
  const match = findingId.match(/^R-\d+(?:-[A-Z0-9]+)*/);
  return match ? match[0] : 'R-GENERIC';
}

export function generateSarifReport(findings: Finding[], modelPath: string): string {
  let rawContent = '';
  try {
    rawContent = fs.readFileSync(modelPath, 'utf8');
  } catch (err) {
    // If reading fails, locator falls back to line 1
  }

  const rulesMap = new Map<string, { id: string; name: string; desc: string }>();
  
  findings.forEach((f) => {
    const ruleId = getSarifRuleId(f.id);
    
    if (!rulesMap.has(ruleId)) {
      rulesMap.set(ruleId, {
        id: ruleId,
        name: f.title.replace(/\s+/g, '-'),
        desc: f.owaspMapping
      });
    }
  });

  const sarifRules = Array.from(rulesMap.values()).map((r) => ({
    id: r.id,
    name: r.name,
    shortDescription: {
      text: r.name
    },
    fullDescription: {
      text: `OWASP LLM/Application Security Mapping: ${r.desc}`
    }
  }));

  const sarifResults = findings.map((f) => {
    const ruleId = getSarifRuleId(f.id);

    let level = 'warning';
    if (f.severity === 'critical') level = 'error';
    else if (f.severity === 'low') level = 'note';

    // Find the target node ID to search for in YAML source mapping
    let targetKey = '';
    if (f.agentId && f.agentId !== 'system') {
      targetKey = f.agentId;
    } else if (f.context?.toolId) {
      targetKey = f.context.toolId;
    } else if (f.context?.dataClassId) {
      targetKey = f.context.dataClassId;
    } else if (f.context?.mcpId) {
      targetKey = f.context.mcpId;
    }

    const line = targetKey ? findLineNumber(rawContent, targetKey) : 1;

    return {
      ruleId: ruleId,
      level: level,
      message: {
        text: `${f.title}: ${f.description}\nRecommendation: ${f.recommendation}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: modelPath,
              uriBaseId: 'SRCROOT'
            },
            region: {
              startLine: line,
              startColumn: 1
            }
          }
        }
      ]
    };
  });

  const sarifDoc = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'OpenAgentModel',
            informationUri: 'https://github.com/yashitkumarsingh/open-agent-model',
            version: getPackageVersion(),
            rules: sarifRules
          }
        },
        results: sarifResults
      }
    ]
  };

  return JSON.stringify(sarifDoc, null, 2);
}
