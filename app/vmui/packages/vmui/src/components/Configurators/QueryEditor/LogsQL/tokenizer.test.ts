import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer";
import { Token, TokenType } from "./types";

const typed = (query: string, type: TokenType): string[] =>
  tokenize(query).filter((t: Token) => t.type === type).map((t: Token) => t.value);

describe("tokenize", () => {
  it("preserves the input", () => {
    const query = "error _time:5m # note\n | stats by (_stream) count() logs";
    expect(tokenize(query).map(t => t.value).join("")).toEqual(query);
  });

  it("returns no tokens for an empty query", () => {
    expect(tokenize("")).toEqual([]);
  });

  describe("comments", () => {
    it("runs until the end of the line", () => {
      expect(typed("error # find errors\nwarn", TokenType.Comment)).toEqual(["# find errors"]);
    });

    it("is not started inside a string", () => {
      expect(typed("_msg:\"# not a comment\"", TokenType.Comment)).toEqual([]);
    });
  });

  describe("strings", () => {
    it("supports all the quote types", () => {
      expect(typed("\"a b\" 'c d' `e f`", TokenType.String)).toEqual(["\"a b\"", "'c d'", "`e f`"]);
    });

    it("keeps escaped quotes inside the string", () => {
      expect(typed("_msg:\"escape\\\"quote\"", TokenType.String)).toEqual(["\"escape\\\"quote\""]);
    });

    it("does not treat a backslash as an escape inside backticks", () => {
      expect(typed("~`\\` foo", TokenType.String)).toEqual(["`\\`"]);
    });

    it("reads an unterminated string until the end of the query", () => {
      expect(typed("_msg:\"unterminated", TokenType.String)).toEqual(["\"unterminated"]);
    });
  });

  describe("numbers and durations", () => {
    it("detects integers, floats and negative numbers", () => {
      expect(typed("12345 0.123 -12.34 1_234_567", TokenType.Number))
        .toEqual(["12345", "0.123", "-12.34", "1_234_567"]);
    });

    it("detects durations, including combined ones", () => {
      expect(typed("_time:5m 1.5h 123ns 1.23µs 1h33m55s", TokenType.Number))
        .toEqual(["5m", "1.5h", "123ns", "1.23µs", "1h33m55s"]);
    });

    it("detects short numeric values, including combined ones", () => {
      expect(typed("10KB 1MiB500KiB200B", TokenType.Number)).toEqual(["10KB", "1MiB500KiB200B"]);
    });

    it("does not treat words which merely start with a digit as numbers", () => {
      expect(typed("_time:2025-04-10T23 3rd", TokenType.Number)).toEqual([]);
    });

    it("rejects a long digit-prefixed word without backtracking", () => {
      const word = `${"1".repeat(500)}z`;
      const start = performance.now();
      expect(typed(word, TokenType.Number)).toEqual([]);
      expect(performance.now() - start).toBeLessThan(100);
    });
  });

  describe("fields", () => {
    it("detects a field name before a colon", () => {
      expect(typed("log.level:error _time:5m", TokenType.Field)).toEqual(["log.level", "_time"]);
    });

    it("detects field names of a stream filter", () => {
      expect(typed("_stream:{app=\"web\",level!=\"info\"}", TokenType.Field)).toEqual(["_stream", "app", "level"]);
    });

    it("detects a field name before a regexp operator", () => {
      expect(typed("level=~\"err|warn\"", TokenType.Field)).toEqual(["level"]);
    });
  });

  describe("pipes", () => {
    it("marks the pipe char and the name which follows it", () => {
      expect(typed("error | stats count() rows", TokenType.Pipe)).toEqual(["|", "stats"]);
    });

    it("marks pipe aliases, which are missing from the generated pipe list", () => {
      expect(typed("* | where level:error | head 5", TokenType.Pipe)).toEqual(["|", "where", "|", "head"]);
    });

    it("marks pipes of a subquery", () => {
      expect(typed("user_id:in(_time:5m | fields user_id)", TokenType.Pipe)).toEqual(["|", "fields"]);
    });

    it("does not mark a pipe name inside a string", () => {
      expect(typed("_msg:\"| stats\"", TokenType.Pipe)).toEqual([]);
    });

    it("marks a pipe name separated from the pipe char by a comment", () => {
      expect(typed("* | # count them\n stats count()", TokenType.Pipe)).toEqual(["|", "stats"]);
    });
  });

  describe("functions", () => {
    it("marks a word which is immediately followed by an opening bracket", () => {
      expect(typed("user_id:in(1,2) ipv4_range(1.2.3.0/24)", TokenType.Function)).toEqual(["in", "ipv4_range"]);
    });

    it("marks stats functions", () => {
      expect(typed("* | stats count_uniq(user_id) users", TokenType.Function)).toEqual(["count_uniq"]);
    });

    it("does not mark a word separated from the bracket by a space", () => {
      expect(typed("* | stats by (_stream) count() n", TokenType.Function)).toEqual(["count"]);
    });
  });

  describe("keywords", () => {
    it("detects logical operators regardless of the case", () => {
      expect(typed("error AND not (warn or debug)", TokenType.Keyword)).toEqual(["AND", "not", "or"]);
    });

    it("detects pipe argument keywords", () => {
      expect(typed("* | sort by (_time) desc", TokenType.Keyword)).toEqual(["by", "desc"]);
    });

    it("prefers a field over a keyword", () => {
      expect(typed("by:error", TokenType.Keyword)).toEqual([]);
      expect(typed("by:error", TokenType.Field)).toEqual(["by"]);
    });
  });

  describe("operators", () => {
    it("splits a leading `-` off a negated filter", () => {
      expect(typed("-error", TokenType.Operator)).toEqual(["-"]);
      expect(typed("-error", TokenType.Text)).toEqual(["error"]);
    });

    it("keeps a leading `-` of a negative number", () => {
      expect(typed("-5", TokenType.Operator)).toEqual([]);
    });

    it("detects the exact and the prefix operators", () => {
      expect(typed("level:=error*", TokenType.Operator)).toEqual([":", "=", "*"]);
    });
  });
});
