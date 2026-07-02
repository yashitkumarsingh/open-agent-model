/**
 * First-principles zero-dependency YAML source map locator.
 * Scans raw text files to map agent/tool/data-class/MCP IDs to their physical line numbers.
 */

/**
 * Escapes all RegExp special characters in a string so it can be safely
 * interpolated into a `new RegExp(...)` constructor without unintended matches.
 * Required because tool/agent IDs may legally contain `.`, `+`, `(`, `)` etc.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findLineNumber(
  rawContent: string,
  targetId: string,
  context?: {
    agentId?: string;
    toolId?: string;
    dataClassId?: string;
    mcpId?: string;
  }
): number {
  if (!rawContent) return 1;
  const lines = rawContent.split(/\r?\n/);
  
  // Track structural block hierarchies of indents
  const stack: { indent: number; section: string; currentId?: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const leadingSpaces = line.length - line.trimStart().length;
    
    // Pop block contexts that are at same or higher nesting level
    while (stack.length > 0 && stack[stack.length - 1].indent >= leadingSpaces) {
      stack.pop();
    }
    
    const parent = stack[stack.length - 1];
    
    // Map root sections (agents, tools, mcp_servers, data_classes)
    const sectionMatch = trimmed.match(/^([a-z0-9_]+)\s*:/i);
    if (sectionMatch && leadingSpaces === 0) {
      stack.push({ indent: leadingSpaces, section: sectionMatch[1] });
      continue;
    }
    
    if (parent) {
      const idMatch = trimmed.match(/^(?:-\s+)?id:\s*['"]?([^'"]+)['"]?/);
      if (idMatch) {
        const id = idMatch[1];
        parent.currentId = id;
        
        if (id === targetId) {
          if (context?.agentId && parent.section === 'agents') return i + 1;
          if (context?.toolId && parent.section === 'tools') return i + 1;
          if (context?.mcpId && parent.section === 'mcp_servers') return i + 1;
          if (context?.dataClassId && parent.section === 'data_classes') return i + 1;
          
          if (!context && ['agents', 'tools', 'mcp_servers', 'data_classes'].includes(parent.section)) {
            return i + 1;
          }
        }
      }
      
      // Look for nested tool references inside agents allowed_tools list
      if (context?.agentId && parent.section === 'agents' && parent.currentId === context.agentId) {
        const listItemMatch = trimmed.match(/^-\s*['"]?([^'"]+)['"]?/);
        if (listItemMatch && listItemMatch[1] === targetId) {
          return i + 1;
        }
      }
    }
  }
  
  // First-principles fallback to global line regex matching if path context is incomplete
  const escapedId = escapeRegExp(targetId);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idRegex = new RegExp(`^\\s*(-\\s+)?id:\\s*['"]?${escapedId}['"]?\\s*($|#)`);
    const listRegex = new RegExp(`^\\s*-\\s*['"]?${escapedId}['"]?\\s*($|#)`);
    
    if (idRegex.test(line) || listRegex.test(line)) {
      return i + 1;
    }
  }
  
  return 1;
}
