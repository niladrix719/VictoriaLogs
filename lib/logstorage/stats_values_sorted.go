package logstorage

import (
	"sort"
	"strings"
	"unsafe"

	"github.com/VictoriaMetrics/VictoriaMetrics/lib/slicesutil"
)

type statsValuesSortedProcessor struct {
	sortFieldsLen int

	entries []*statsJSONValuesSortedEntry

	sortColumns   [][]string
	sortValuesBuf []string
}

func (svp *statsValuesSortedProcessor) updateStatsForAllRows(sf statsFunc, br *blockResult) int {
	sv := sf.(*statsValues)

	svp.initSortColumns(br, sv.sortFields)

	stateSizeIncrease := 0
	mc := getMatchingColumns(br, sv.fieldFilters)
	for rowIdx := range br.rowsLen {
		stateSizeIncrease += svp.updateStateForRow(br, mc.cs, rowIdx)
	}
	putMatchingColumns(mc)

	return stateSizeIncrease
}

func (svp *statsValuesSortedProcessor) updateStatsForRow(sf statsFunc, br *blockResult, rowIdx int) int {
	sv := sf.(*statsValues)

	svp.initSortColumns(br, sv.sortFields)

	mc := getMatchingColumns(br, sv.fieldFilters)
	stateSizeIncrease := svp.updateStateForRow(br, mc.cs, rowIdx)
	putMatchingColumns(mc)

	return stateSizeIncrease
}

func (svp *statsValuesSortedProcessor) updateStateForRow(br *blockResult, cs []*blockResultColumn, rowIdx int) int {
	svp.sortValuesBuf = slicesutil.SetLength(svp.sortValuesBuf, len(svp.sortColumns))
	for i, values := range svp.sortColumns {
		svp.sortValuesBuf[i] = values[rowIdx]
	}

	stateSizeIncrease := 0
	for _, c := range cs {
		v := c.getValueAtRow(br, rowIdx)
		e := newStatsValuesSortedEntry(v, svp.sortValuesBuf)
		svp.entries = append(svp.entries, e)
		stateSizeIncrease += e.sizeBytes() + int(unsafe.Sizeof(svp.entries[0]))
	}
	return stateSizeIncrease
}

// newStatsValuesSortedEntry returns an entry holding the raw value with the given sortValues.
func newStatsValuesSortedEntry(value string, sortValues []string) *statsJSONValuesSortedEntry {
	sortValuesCopy := make([]string, len(sortValues))
	for i, v := range sortValues {
		sortValuesCopy[i] = strings.Clone(v)
	}

	return &statsJSONValuesSortedEntry{
		value:      strings.Clone(value),
		sortValues: sortValuesCopy,
	}
}

func (svp *statsValuesSortedProcessor) initSortColumns(br *blockResult, sortFields []*bySortField) {
	svp.sortColumns = svp.sortColumns[:0]
	for _, sf := range sortFields {
		c := br.getColumnByName(sf.name)
		values := c.getValues(br)
		svp.sortColumns = append(svp.sortColumns, values)
	}
}

func (svp *statsValuesSortedProcessor) mergeState(_ *chunkedAllocator, _ statsFunc, sfp statsProcessor) {
	src := sfp.(*statsValuesSortedProcessor)
	svp.entries = append(svp.entries, src.entries...)
}

func (svp *statsValuesSortedProcessor) exportState(dst []byte, _ <-chan struct{}) []byte {
	return statsJSONValuesSortedMarshalState(dst, svp.entries)
}

func (svp *statsValuesSortedProcessor) importState(src []byte, _ <-chan struct{}) (int, error) {
	entries, stateSizeIncrease, err := statsJSONValuesSortedUnmarshalState(src, svp.sortFieldsLen)
	if err != nil {
		return 0, err
	}
	svp.entries = entries

	return stateSizeIncrease, nil
}

func (svp *statsValuesSortedProcessor) finalizeStats(sf statsFunc, dst []byte, _ <-chan struct{}) []byte {
	sv := sf.(*statsValues)

	entries := svp.entries

	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		return statsJSONValuesLess(sv.sortFields, a.sortValues, b.sortValues)
	})

	values := make([]string, len(entries))
	for i := range entries {
		values[i] = entries[i].value
	}

	return marshalJSONArray(dst, values)
}
