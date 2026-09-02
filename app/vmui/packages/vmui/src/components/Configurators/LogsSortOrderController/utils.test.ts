import { describe, it, expect } from "vitest";
import { applySortOrder, hasCustomSortPipe } from "./utils";
import { LOGS_SORT_ORDER } from "../../../constants/logs";

describe("hasCustomSortPipe", () => {
  it("detects pipes, which order the results", () => {
    expect(hasCustomSortPipe("* | sort by (foo) desc")).toBe(true);
    expect(hasCustomSortPipe("* | order by (foo)")).toBe(true);
    expect(hasCustomSortPipe("* | SORT by (foo)")).toBe(true);
    expect(hasCustomSortPipe("* | first 10 by (_time)")).toBe(true);
    expect(hasCustomSortPipe("* | last 10 by (duration)")).toBe(true);
    expect(hasCustomSortPipe("error | stats count() rows | sort by (rows)")).toBe(true);
  });

  it("detects the sort by _time pipe, which isn't the last one", () => {
    expect(hasCustomSortPipe("* | sort by (_time) | fields _msg")).toBe(true);
  });

  it("doesn't detect the trailing sort by _time pipe", () => {
    expect(hasCustomSortPipe("* | sort by (_time)")).toBe(false);
    expect(hasCustomSortPipe("* |sort by (_time) desc")).toBe(false);
    expect(hasCustomSortPipe("* | order by (_time desc)")).toBe(false);
    expect(hasCustomSortPipe("* | sort (_time) asc  ")).toBe(false);
  });

  it("doesn't detect pipes when they are absent", () => {
    expect(hasCustomSortPipe("*")).toBe(false);
    expect(hasCustomSortPipe("error")).toBe(false);
    expect(hasCustomSortPipe("* | stats count() rows")).toBe(false);
  });

  it("ignores pipes inside quoted strings and field names", () => {
    expect(hasCustomSortPipe("foo:\"| sort by (x)\"")).toBe(false);
    expect(hasCustomSortPipe("foo:\"a\\\"| sort by (x)\"")).toBe(false);
    expect(hasCustomSortPipe("foo:'| sort'")).toBe(false);
    expect(hasCustomSortPipe("foo:`| sort by (x)`")).toBe(false);
    expect(hasCustomSortPipe("sort_key:abc")).toBe(false);
    expect(hasCustomSortPipe("* | fields sorted, ordered")).toBe(false);
  });

  it("doesn't let a quote opened in one pipe swallow the next pipe", () => {
    // a stray, unescaped quote inside one pipe's argument shouldn't hide the following `| sort` pipe
    expect(hasCustomSortPipe("* | fields 'unterminated | sort by (foo)")).toBe(true);
  });
});

describe("applySortOrder", () => {
  it("leaves the query as is for the descending order", () => {
    expect(applySortOrder("*", LOGS_SORT_ORDER.DESC)).toBe("*");
  });

  it("appends the sort pipe for the ascending order", () => {
    expect(applySortOrder("*", LOGS_SORT_ORDER.ASC)).toBe("* | sort by (_time)");
    expect(applySortOrder("  error  ", LOGS_SORT_ORDER.ASC)).toBe("error | sort by (_time)");
  });

  it("overrides the trailing sort by _time pipe", () => {
    expect(applySortOrder("* | sort by (_time) desc", LOGS_SORT_ORDER.ASC)).toBe("* | sort by (_time)");
    expect(applySortOrder("* | order by (_time desc)", LOGS_SORT_ORDER.ASC)).toBe("* | sort by (_time)");
    expect(applySortOrder("* | sort by (_time)", LOGS_SORT_ORDER.ASC)).toBe("* | sort by (_time)");
    expect(applySortOrder("* | sort by (_time)", LOGS_SORT_ORDER.DESC)).toBe("* | sort by (_time) desc");
  });

  it("leaves the query as is when it orders the results on its own", () => {
    expect(applySortOrder("* | sort by (foo)", LOGS_SORT_ORDER.ASC)).toBe("* | sort by (foo)");
    expect(applySortOrder("* | order by (foo)", LOGS_SORT_ORDER.ASC)).toBe("* | order by (foo)");
    expect(applySortOrder("* | first 10 by (_time)", LOGS_SORT_ORDER.ASC)).toBe("* | first 10 by (_time)");
    expect(applySortOrder("* | sort by (foo)", LOGS_SORT_ORDER.DESC)).toBe("* | sort by (foo)");
  });
});
