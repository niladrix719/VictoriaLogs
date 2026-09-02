// Helpers for scanning raw LogsQL query text, e.g. to find pipe or token boundaries
// without being tripped up by quoted strings.

// LogsQL quote characters: a string can be quoted with any of these, see
// https://docs.victoriametrics.com/victorialogs/logsql/#string-filter
export const QUOTE_CHARS = ["\"", "'", "`"];

/**
 * isEscapedAt returns true if the character at index i in s is escaped by
 * an odd number of preceding backslashes.
 */
export const isEscapedAt = (s: string, i: number): boolean => {
  let backslashes = 0;
  for (let j = i - 1; j >= 0 && s[j] === "\\"; j--) backslashes++;
  return backslashes % 2 === 1;
};

/**
 * findUnclosedQuoteIndex returns the index of the quote character in s, which isn't closed
 * by a matching quote character, or null if all quotes are balanced.
 *
 * Callers scanning s character by character can use this to recover gracefully from an
 * unterminated quote, e.g. while the user is still typing a query: treat the position it
 * opens at as not a quote at all, instead of letting it swallow the rest of s.
 */
export const findUnclosedQuoteIndex = (s: string): number | null => {
  let quote: string | null = null;
  let openedAt: number | null = null;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (!QUOTE_CHARS.includes(char) || isEscapedAt(s, i)) continue;

    if (quote === null) {
      quote = char;
      openedAt = i;
    } else if (char === quote) {
      quote = null;
      openedAt = null;
    }
  }

  return openedAt;
};
