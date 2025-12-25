package vlstorage

import (
	"math"
	"sort"

	"github.com/VictoriaMetrics/VictoriaMetrics/lib/slicesutil"

	"github.com/VictoriaMetrics/VictoriaLogs/lib/logstorage"
)

func runOptimizedFirstNResultsQuery(qctx *logstorage.QueryContext, offset, limit uint64, writeBlock logstorage.WriteDataBlockFunc) error {
	rows, err := getFirstNQueryResults(qctx, offset+limit)
	if err != nil {
		return err
	}
	if uint64(len(rows)) > offset {
		rows = rows[offset:]
	}

	var db logstorage.DataBlock
	var columns []logstorage.BlockColumn
	var values []string
	for _, r := range rows {
		columns = slicesutil.SetLength(columns, len(r.fields))
		values = slicesutil.SetLength(values, len(r.fields))
		for j, f := range r.fields {
			values[j] = f.Value
			columns[j].Name = f.Name
			columns[j].Values = values[j : j+1]
		}
		db.Columns = columns
		writeBlock(0, &db)
	}
	return nil
}

func getFirstNQueryResults(qctx *logstorage.QueryContext, limit uint64) ([]logRow, error) {
	timestamp := qctx.Query.GetTimestamp()

	q := qctx.Query.Clone(timestamp)
	q.AddPipeOffsetLimit(0, 2*limit)
	qctxLocal := qctx.WithQuery(q)
	rows, err := getQueryResults(qctxLocal)
	if err != nil {
		return nil, err
	}

	if uint64(len(rows)) < 2*limit {
		// Fast path - the requested time range contains up to 2*limit rows.
		rows = getFirstNRows(rows, limit)
		return rows, nil
	}

	// Slow path - use binary search for adjusting time range for selecting up to 2*limit rows.
	start, end := q.GetFilterTimeRange()
	if end < math.MaxInt64 {
		end++
	}
	end -= end/2 - start/2
	n := limit

	var rowsFound []logRow
	var firstNonEmptyRows []logRow

	for {
		q = qctx.Query.CloneWithTimeFilter(timestamp, start, end-1)
		q.AddPipeOffsetLimit(0, 2*n)
		qctxLocal := qctx.WithQuery(q)
		rows, err := getQueryResults(qctxLocal)
		if err != nil {
			return nil, err
		}

		if end/2-start/2 <= 0 {
			// The [start ... end) time range doesn't exceed a nanosecond, so it cannot be adjusted more.
			// Return up to limit rows from rows and firstNonEmptyRows.
			rowsFound = append(rowsFound, firstNonEmptyRows...)
			rowsFound = append(rowsFound, rows...)
			rowsFound = getFirstNRows(rowsFound, limit)
			return rowsFound, nil
		}

			if uint64(len(rows)) >= 2*n {
				// The number of found rows on the [start ... end) time range exceeds 2*n,
				// so search for the rows on the adjusted time range [start ... start+(end/2-start/2)).
				if !logstorage.CanApplyLastNResultsOptimization(start, end) {
					// It is faster obtaining the first N logs as is on such a small time range instead of using binary search.
					rows, err := getLogRowsFirstN(qctx, start, end, n)
					if err != nil {
						return nil, err
				}
				rowsFound = append(rowsFound, rows...)
				rowsFound = getFirstNRows(rowsFound, limit)
				return rowsFound, nil
			}
			end -= end/2 - start/2
			firstNonEmptyRows = rows
			continue
		}
		if uint64(len(rowsFound)+len(rows)) >= limit {
			// The found rows contain the needed limit rows with the smallest timestamps.
			rowsFound = append(rowsFound, rows...)
			rowsFound = getFirstNRows(rowsFound, limit)
			return rowsFound, nil
		}

		// The number of found rows is below the limit. This means the [start ... end) time range
		// doesn't cover the needed logs, so it must be extended.
		// Append the found rows to rowsFound, adjust n, so it doesn't take into account already found rows
		// and adjust the time range to search logs at [end ... end+(end/2-start/2)).
		rowsFound = append(rowsFound, rows...)
		n -= uint64(len(rows))

		d := end/2 - start/2
		start = end
		end += d
	}
}

func getLogRowsFirstN(qctx *logstorage.QueryContext, start, end int64, n uint64) ([]logRow, error) {
	timestamp := qctx.Query.GetTimestamp()
	q := qctx.Query.CloneWithTimeFilter(timestamp, start, end)
	q.AddPipeSortByTime()
	q.AddPipeOffsetLimit(0, n)
	qctxLocal := qctx.WithQuery(q)
	return getQueryResults(qctxLocal)
}

func getFirstNRows(rows []logRow, limit uint64) []logRow {
	sortLogRowsAsc(rows)
	if uint64(len(rows)) > limit {
		rows = rows[:limit]
	}
	return rows
}

func sortLogRowsAsc(rows []logRow) {
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].timestamp < rows[j].timestamp
	})
}
