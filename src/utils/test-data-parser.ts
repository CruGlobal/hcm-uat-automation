/**
 * Shared utility for parsing test data strings into key-value pairs.
 *
 * Handles multiple delimiter strategies:
 * - Semicolon-separated: "key: value; key2: value2"
 * - Newline-separated: "key: value\nkey2: value2"
 * - Both colon and equals separators: "key: value" or "key = value"
 *
 * Tries each delimiter independently and returns the first that yields results,
 * falling back to splitting on both delimiters at once.
 */
export function parseTestData(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;

  // Try each delimiter independently first (journeys approach — avoids
  // splitting on characters that appear inside values)
  const delimiters = [';', '\n'];
  for (const delim of delimiters) {
    const parts = text.split(delim).filter(p => p.trim());
    for (const part of parts) {
      const match = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
      if (match) {
        result[match[1].toLowerCase().trim()] = match[2].trim();
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  return result;
}

/**
 * Parse test data from multiple text sources, merging all results.
 * Useful for UATTestCase where data comes from testData + preConditions.
 * Later sources override earlier ones for duplicate keys.
 */
export function parseTestDataMulti(...sources: (string | undefined)[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    if (source) {
      Object.assign(result, parseTestData(source));
    }
  }
  return result;
}
