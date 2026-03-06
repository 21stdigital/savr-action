/**
 * Utility functions for safe logging and string handling
 */

/**
 * Sanitizes a string for safe logging in GitHub Actions.
 *
 * GitHub Actions interprets lines starting with `::` as workflow commands.
 * Malicious or accidental commit messages containing these patterns could:
 * - Inject fake annotations (::error::, ::warning::, ::notice::)
 * - Mask arbitrary strings (::add-mask::)
 * - Manipulate workflow outputs
 *
 * This function escapes `::` sequences to prevent workflow command injection.
 *
 * @param input - The string to sanitize (e.g., commit message, release notes)
 * @returns The sanitized string safe for logging
 *
 * @example
 * ```ts
 * // Dangerous input
 * const message = "feat: ::set-output name=foo::bar"
 *
 * // Safe for logging
 * info(sanitizeLogOutput(message))
 * // Outputs: "feat: \u200B::\u200Bset-output name=foo\u200B::\u200Bbar"
 * ```
 */
export const sanitizeLogOutput = (input: string): string => {
  // Insert a zero-width space between the two colons to break the command pattern
  // This preserves readability while preventing command interpretation
  return input.replace(/::/g, ':\u200B:')
}
