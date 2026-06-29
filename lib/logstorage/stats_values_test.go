package logstorage

import (
	"reflect"
	"testing"
)

func TestParseStatsValuesSuccess(t *testing.T) {
	f := func(pipeStr string) {
		t.Helper()
		expectParseStatsFuncSuccess(t, pipeStr)
	}

	f(`values(*)`)
	f(`values(a)`)
	f(`values(a, b)`)
	f(`values(a*, b)`)
	f(`values(a*, b) sort by (x desc, y)`)
	f(`values(a, b) limit 10`)
	f(`values(a*, b) sort by (x desc, y) limit 10`)
}

func TestParseStatsValuesFailure(t *testing.T) {
	f := func(pipeStr string) {
		t.Helper()
		expectParseStatsFuncFailure(t, pipeStr)
	}

	f(`values`)
	f(`values(a b)`)
	f(`values(x) y`)
	f(`values(a, b) limit`)
	f(`values(a, b) limit foo`)
}

func TestStatsValues_ExportImportState(t *testing.T) {
	var a chunkedAllocator
	newStatsValuesProcessor := func() *statsValuesProcessor {
		return a.newStatsValuesProcessor()
	}

	f := func(svp *statsValuesProcessor, dataLenExpected int) {
		t.Helper()

		data := svp.exportState(nil, nil)
		dataLen := len(data)
		if dataLen != dataLenExpected {
			t.Fatalf("unexpected dataLen; got %d; want %d", dataLen, dataLenExpected)
		}

		svp2 := newStatsValuesProcessor()
		_, err := svp2.importState(data, nil)
		if err != nil {
			t.Fatalf("unexpected error: %s", err)
		}

		if !reflect.DeepEqual(svp, svp2) {
			t.Fatalf("unexpected state imported\ngot\n%#v\nwant\n%#v", svp2, svp)
		}
	}

	// empty state
	svp := newStatsValuesProcessor()
	f(svp, 1)

	// non-empty state
	svp = newStatsValuesProcessor()
	svp.values = []string{"foo", "bar", "baz"}
	f(svp, 13)
}

func TestStatsValues(t *testing.T) {
	f := func(pipeStr string, rows, rowsExpected [][]Field) {
		t.Helper()
		expectPipeResults(t, pipeStr, rows, rowsExpected)
	}

	// sort by the collected field without limit
	f("stats values(a) sort by (a) as x", [][]Field{
		{
			{"a", `2`},
		},
		{
			{"a", `1`},
		},
		{
			{"a", `3`},
		},
	}, [][]Field{
		{
			{"x", `["1","2","3"]`},
		},
	})

	// sort by the collected field with limit
	f("stats values(a) order (a) limit 2 as x", [][]Field{
		{
			{"a", `2`},
		},
		{
			{"a", `1`},
		},
		{
			{"a", `3`},
		},
	}, [][]Field{
		{
			{"x", `["1","2"]`},
		},
	})

	// reverse order with limit
	f("stats values(a) sort by (a desc) limit 1 as x", [][]Field{
		{
			{"a", `2`},
		},
		{
			{"a", `1`},
		},
		{
			{"a", `3`},
		},
	}, [][]Field{
		{
			{"x", `["3"]`},
		},
	})

	// sort the collected values by another field
	f("stats values(v) sort by (t) as x", [][]Field{
		{
			{"v", `foo`},
			{"t", `3`},
		},
		{
			{"v", `bar`},
			{"t", `1`},
		},
		{
			{"v", `baz`},
			{"t", `2`},
		},
	}, [][]Field{
		{
			{"x", `["bar","baz","foo"]`},
		},
	})

	// multiple sorting columns with limit (topk path)
	f("stats values(v) sort by (a desc, b) limit 2 as x", [][]Field{
		{
			{"v", `x`},
			{"a", `3`},
			{"b", `123`},
		},
		{
			{"v", `y`},
			{"a", `1`},
		},
		{
			{"v", `z`},
			{"a", `3`},
			{"b", `54`},
		},
	}, [][]Field{
		{
			{"x", `["z","x"]`},
		},
	})
}

func TestStatsValuesSortedProcessor_ExportImportState(t *testing.T) {
	var a chunkedAllocator
	newStatsValuesSortedProcessor := func() *statsValuesSortedProcessor {
		return a.newStatsValuesSortedProcessor()
	}

	f := func(svp *statsValuesSortedProcessor, sortFieldsLen, dataLenExpected int) {
		t.Helper()

		svp.sortFieldsLen = sortFieldsLen
		data := svp.exportState(nil, nil)
		dataLen := len(data)
		if dataLen != dataLenExpected {
			t.Fatalf("unexpected dataLen; got %d; want %d", dataLen, dataLenExpected)
		}

		svp2 := newStatsValuesSortedProcessor()
		svp2.sortFieldsLen = sortFieldsLen
		_, err := svp2.importState(data, nil)
		if err != nil {
			t.Fatalf("unexpected error: %s", err)
		}

		if !reflect.DeepEqual(svp, svp2) {
			t.Fatalf("unexpected state imported\ngot\n%#v\nwant\n%#v", svp2, svp)
		}
	}

	// empty state
	svp := newStatsValuesSortedProcessor()
	f(svp, 0, 1)

	// non-empty state
	svp = newStatsValuesSortedProcessor()
	svp.entries = []*statsJSONValuesSortedEntry{
		{
			value:      "foo",
			sortValues: []string{"v1-for-foo", "v2-for-foo"},
		},
		{
			value:      "bar",
			sortValues: []string{"v1-for-bar", "v2-for-bar"},
		},
	}
	f(svp, 2, 53)
}

func TestStatsValuesTopkProcessor_ExportImportState(t *testing.T) {
	var a chunkedAllocator
	newStatsValuesTopkProcessor := func() *statsValuesTopkProcessor {
		return a.newStatsValuesTopkProcessor()
	}

	f := func(svp *statsValuesTopkProcessor, sortFieldsLen, dataLenExpected int) {
		t.Helper()

		svp.sortFieldsLen = sortFieldsLen
		data := svp.exportState(nil, nil)
		dataLen := len(data)
		if dataLen != dataLenExpected {
			t.Fatalf("unexpected dataLen; got %d; want %d", dataLen, dataLenExpected)
		}

		svp2 := newStatsValuesTopkProcessor()
		svp2.sortFieldsLen = sortFieldsLen
		_, err := svp2.importState(data, nil)
		if err != nil {
			t.Fatalf("unexpected error: %s", err)
		}

		if !reflect.DeepEqual(svp, svp2) {
			t.Fatalf("unexpected state imported\ngot\n%#v\nwant\n%#v", svp2, svp)
		}
	}

	// empty state
	svp := newStatsValuesTopkProcessor()
	f(svp, 0, 1)

	// non-empty state
	svp = newStatsValuesTopkProcessor()
	svp.h.entries = []*statsJSONValuesSortedEntry{
		{
			value:      "foo",
			sortValues: []string{"v1-for-foo", "v2-for-foo"},
		},
		{
			value:      "bar",
			sortValues: []string{"v1-for-bar", "v2-for-bar"},
		},
	}
	f(svp, 2, 53)
}
