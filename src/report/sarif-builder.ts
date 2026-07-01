import { Finding } from '../risk-engine/rules.js';

export function generateSarifReport(findings: Finding[], modelPath: string): string {
  const rulesMap = new Map<string, { id: string; name: string; desc: string }>();
  
  findings.forEach((f) => {
    // Determine a rule ID prefix (e.g. R-001)
    let ruleId = 'R-GENERIC';
    const match = f.id.match(/R-\d+/);
    if (match) {
      ruleId = match[0];
    }
    
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
      text: `OWASP Agentic Mapping: ${r.desc}`
    }
  }));

  const sarifResults = findings.map((f) => {
    let ruleId = 'R-GENERIC';
    const match = f.id.match(/R-\d+/);
    if (match) {
      ruleId = match[0];
    }

    let level = 'warning';
    if (f.severity === 'critical') level = 'error';
    else if (f.severity === 'low') level = 'note';

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
              startLine: 1,
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
            informationUri: 'https://github.com/open-agent-model/open-agent-model',
            version: '0.1.0',
            rules: sarifRules
          }
        },
        results: sarifResults
      }
    ]
  };

  return JSON.stringify(sarifDoc, null, 2);
}
