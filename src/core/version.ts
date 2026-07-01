import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getPackageVersion(): string {
  const packagePath = path.resolve(__dirname, '../../package.json');

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (typeof packageJson.version === 'string') {
      return packageJson.version;
    }
  } catch {
    // Fall through to a conservative value for unusual packaged installs.
  }

  return '0.0.0';
}
