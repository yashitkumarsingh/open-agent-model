/**
 * First-principles zero-dependency YAML source map locator.
 * Scans raw text files to map agent/tool/data-class/MCP IDs to their physical line numbers.
 */
export function findLineNumber(rawContent: string, targetId: string): number {
  if (!rawContent) return 1;
  const lines = rawContent.split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for identifier patterns in YAML:
    // 1) "id: targetId" or "- id: targetId"
    // 2) "- targetId" (for list items like allowed_tools references)
    const idRegex = new RegExp(`^\\s*(-\\s+)?id:\\s*['"]?${targetId}['"]?\\s*($|#)`);
    const listRegex = new RegExp(`^\\s*-\\s*['"]?${targetId}['"]?\\s*($|#)`);
    
    if (idRegex.test(line) || listRegex.test(line)) {
      return i + 1; // 1-indexed line number
    }
  }
  
  return 1; // Fallback to start of document if not located
}
