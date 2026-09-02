import { LOGS_SORT_ORDER } from "../../../constants/logs";
import { findUnclosedQuoteIndex, isEscapedAt, QUOTE_CHARS } from "../../../utils/logsql";
import { SortOrder } from "./hooks/useSortOrderController";

// Matches a pipe, which sets the order of the results: `sort` (and its `order` alias), `first` and `last`.
const ORDER_PIPE_NAME_REGEXP = /^(?:sort|order|first|last)\b/i;

// Matches a `sort`/`order` pipe body, which sorts only by `_time`, e.g. `sort by (_time)` or `order (_time desc)`.
const TIME_SORT_PIPE_REGEXP =
  /^(?:sort|order)\s+(?:by\s*)?\(\s*_time(?:\s+(?:asc|desc))?\s*\)(?:\s+(?:asc|desc))?$/i;

interface PipeSegment {
  // The pipe body, e.g. "sort by (_time) desc" for "... | sort by (_time) desc".
  value: string;
  // The index of the `|` character starting this pipe in the original query.
  pipeStart: number;
}

/**
 * splitPipes splits the query into its top-level `| ...` pipes.
 *
 * A `|` inside a quoted string, e.g. `foo:"| sort by (x)"`, isn't a pipe delimiter and is skipped.
 * A quote left unclosed, e.g. by a query the user is still typing, is treated as not a quote
 * from its opening position onward, so a real pipe after it isn't hidden.
 *
 * Uses the same quote-tracking as the query editor's own parser
 * (see QueryEditor/LogsQL/helpers/parser.ts's splitLogicalParts), which also splits on
 * top-level pipes, but additionally tracks brackets and space-separated tokens for
 * autocomplete purposes that aren't needed here.
 */
const splitPipes = (query: string): PipeSegment[] => {
  const unclosedQuoteIndex = findUnclosedQuoteIndex(query);

  const segments: PipeSegment[] = [];
  let quote: string | null = null;
  let pipeStart = -1;

  for (let i = 0; i < query.length; i++) {
    if (unclosedQuoteIndex !== null && i >= unclosedQuoteIndex) quote = null;

    const char = query[i];

    if (QUOTE_CHARS.includes(char) && !isEscapedAt(query, i)) {
      if (quote === null) quote = char;
      else if (char === quote) quote = null;
      continue;
    }

    if (quote !== null) continue;

    if (char === "|") {
      if (pipeStart >= 0) segments.push({ value: query.slice(pipeStart + 1, i).trim(), pipeStart });
      pipeStart = i;
    }
  }

  if (pipeStart >= 0) segments.push({ value: query.slice(pipeStart + 1).trim(), pipeStart });

  return segments;
};

/**
 * hasCustomSortPipe returns true if the query orders its results on its own
 * with a pipe other than a trailing `sort`/`order` by `_time`.
 *
 * See https://docs.victoriametrics.com/victorialogs/logsql/#sort-pipe
 */
export const hasCustomSortPipe = (query: string): boolean => {
  const segments = splitPipes(query);

  return segments.some((segment, i) => {
    const isTrailingTimeSort = i === segments.length - 1 && TIME_SORT_PIPE_REGEXP.test(segment.value);
    return !isTrailingTimeSort && ORDER_PIPE_NAME_REGEXP.test(segment.value);
  });
};

/**
 * applySortOrder sets the order of the query results by `_time`.
 *
 * A trailing `sort`/`order` by `_time` pipe in the query is replaced according to sortOrder.
 * Descending order is the default at /select/logsql/query, so the query without such a pipe is left as is for it.
 * Queries, which order the results on their own with other pipes, are left as is too.
 */
export const applySortOrder = (query: string, sortOrder: SortOrder): string => {
  if (hasCustomSortPipe(query)) return query;

  const segments = splitPipes(query);
  const last = segments[segments.length - 1];
  const hasTrailingTimeSort = Boolean(last && TIME_SORT_PIPE_REGEXP.test(last.value));

  const stripped = hasTrailingTimeSort ? query.slice(0, last.pipeStart).trim() : query.trim();

  if (sortOrder === LOGS_SORT_ORDER.ASC) return `${stripped} | sort by (_time)`;
  return hasTrailingTimeSort ? `${stripped} | sort by (_time) desc` : query;
};
