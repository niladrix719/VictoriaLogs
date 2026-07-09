import { Token, TokenType } from "./types";

const KEYWORDS = new Set(["and", "or", "not", "by", "as", "on", "if", "with", "asc", "desc"]);

const QUOTE_CHARS = ["'", "\"", "`"];

const OPERATOR_CHARS = new Set([":", "=", "~", "!", "<", ">", "*", ",", "(", ")", "[", "]", "{", "}"]);

const COMMENT_CHAR = "#";
const PIPE_CHAR = "|";

const NUMBER_REGEXP = /^-?(?:\d[\d_]*(?:\.[\d_]+)?(?:ns|µs|us|ms|KiB|MiB|GiB|TiB|KB|MB|GB|TB|Ki|Mi|Gi|Ti|[BKMGTsmhdwy])?)+$/;

const FIELD_OPERATOR_REGEXP = /^(?:[:=]|![=~])/;

const isWordChar = (char: string): boolean => {
  return !/\s/.test(char)
    && char !== COMMENT_CHAR
    && char !== PIPE_CHAR
    && !QUOTE_CHARS.includes(char)
    && !OPERATOR_CHARS.has(char);
};

const findStringEnd = (input: string, start: number): number => {
  const quote = input[start];
  // Backtick-quoted strings have no escape sequences, and cannot contain a backtick.
  const hasEscaping = quote !== "`";

  let i = start + 1;
  while (i < input.length) {
    const char = input[i];
    if (hasEscaping && char === "\\") {
      i += 2;
      continue;
    }
    if (char === quote) return i + 1;
    i++;
  }

  return input.length;
};

const findWhile = (input: string, start: number, predicate: (char: string) => boolean): number => {
  let i = start;
  while (i < input.length && predicate(input[i])) i++;
  return i;
};

const isNumber = (word: string): boolean => NUMBER_REGEXP.test(word);

export const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let expectPipeName = false;

  const pushToken = (type: TokenType, start: number, end: number) => {
    tokens.push({ type, value: input.slice(start, end) });
    return end;
  };

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i = pushToken(TokenType.Text, i, findWhile(input, i, c => /\s/.test(c)));
      continue;
    }

    // A comment may appear at any place, so it doesn't interrupt the surrounding expression.
    if (char === COMMENT_CHAR) {
      const lineEnd = input.indexOf("\n", i);
      i = pushToken(TokenType.Comment, i, lineEnd === -1 ? input.length : lineEnd);
      continue;
    }

    if (QUOTE_CHARS.includes(char)) {
      i = pushToken(TokenType.String, i, findStringEnd(input, i));
      expectPipeName = false;
      continue;
    }

    if (char === PIPE_CHAR) {
      i = pushToken(TokenType.Pipe, i, i + 1);
      expectPipeName = true;
      continue;
    }

    if (OPERATOR_CHARS.has(char)) {
      i = pushToken(TokenType.Operator, i, i + 1);
      expectPipeName = false;
      continue;
    }

    const wordEnd = findWhile(input, i, isWordChar);
    const word = input.slice(i, wordEnd);

    // A leading `-` negates the following filter, unless the whole word is a negative number.
    if (word.startsWith("-") && !isNumber(word)) {
      i = pushToken(TokenType.Operator, i, i + 1);
      continue;
    }

    i = pushToken(getWordType(word, input.slice(wordEnd), expectPipeName), i, wordEnd);
    expectPipeName = false;
  }

  return tokens;
};

const getWordType = (word: string, restOfInput: string, expectPipeName: boolean): TokenType => {
  if (FIELD_OPERATOR_REGEXP.test(restOfInput)) return TokenType.Field;
  if (expectPipeName) return TokenType.Pipe;
  if (restOfInput.startsWith("(")) return TokenType.Function;
  if (KEYWORDS.has(word.toLowerCase())) return TokenType.Keyword;
  if (isNumber(word)) return TokenType.Number;
  return TokenType.Text;
};
