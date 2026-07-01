import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Running pre-commit quality checks...');

try {
  // 1. Build project
  console.log('Compiling TypeScript codebase...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2. Validate agentmodel.yaml
  console.log('Validating agentmodel.yaml...');
  execSync('node dist/index.js validate -i agentmodel.yaml', { stdio: 'inherit' });

  // 3. Validate examples
  console.log('Validating reference example files...');
  const examplesDir = './examples';
  const files = fs.readdirSync(examplesDir);
  for (const file of files) {
    if (file.endsWith('.yaml') && file !== 'invalid-references.yaml') {
      console.log(`Checking examples/${file}...`);
      execSync(`node dist/index.js validate -i examples/${file}`, { stdio: 'inherit' });
    }
  }

  console.log('\x1b[32m✔ All pre-commit checks PASSED!\x1b[0m');
  process.exit(0);
} catch (error) {
  console.error('\x1b[31m✘ Pre-commit checks FAILED!\x1b[0m');
  process.exit(1);
}
