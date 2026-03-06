/**
 * Escapes `::` sequences to prevent GitHub Actions workflow command injection.
 * Inserts a zero-width space between colons so commands are not interpreted.
 */
export const sanitizeLogOutput = (input: string): string => {
  // Insert a zero-width space between the two colons to break the command pattern
  // This preserves readability while preventing command interpretation
  return input.replace(/::/g, ':\u200B:')
}
