package splunk

import (
	"flag"
	"fmt"
	"net/http"
	"time"

	"github.com/VictoriaMetrics/VictoriaMetrics/lib/flagutil"
	"github.com/VictoriaMetrics/VictoriaMetrics/lib/httpserver"
	"github.com/VictoriaMetrics/VictoriaMetrics/lib/logger"
	"github.com/VictoriaMetrics/VictoriaMetrics/lib/protoparser/protoparserutil"
	"github.com/VictoriaMetrics/metrics"

	"github.com/VictoriaMetrics/VictoriaLogs/app/vlinsert/insertutil"
	"github.com/VictoriaMetrics/VictoriaLogs/lib/logstorage"
)

var (
	splunkStreamFields = flagutil.NewArrayString("splunk.streamFields", "Comma-separated list of fields to use as log stream fields for logs ingested over splunk protocol. "+
		"See https://docs.victoriametrics.com/victorialogs/data-ingestion/splunk/#stream-fields")
	splunkIgnoreFields = flagutil.NewArrayString("splunk.ignoreFields", "Comma-separated list of fields to ignore for logs ingested over splunk protocol. "+
		"See https://docs.victoriametrics.com/victorialogs/data-ingestion/splunk/#dropping-fields")
	splunkPreserveJSONKeys = flagutil.NewArrayString("splunk.preserveJSONKeys", "Comma-separated list of JSON keys that should be preserved from flattening. ")
	splunkTimeField        = flag.String("splunk.timeField", "time", "Field to use as a log timestamp for logs ingested via splunk protocol. "+
		"See https://docs.victoriametrics.com/victorialogs/data-ingestion/splunk/#time-field")
	splunkMsgField = flagutil.NewArrayString("splunk.msgField", "Field to use as a log message for logs ingested via splunk protocol. "+
		"See https://docs.victoriametrics.com/victorialogs/data-ingestion/splunk/#message-field")
	splunkTenantID = flag.String("splunk.tenantID", "0:0", "TenantID for logs ingested via the Splunk endpoint. "+
		"See https://docs.victoriametrics.com/victorialogs/data-ingestion/splunk/#multitenancy")
	splunkMaxRequestSize = flagutil.NewBytes("splunk.maxRequestSize", 64*1024*1024, "The maximum size in bytes of a single Splunk request")
)

func getCommonParams(r *http.Request) (*insertutil.CommonParams, error) {
	cp, err := insertutil.GetCommonParams(r)
	if err != nil {
		return nil, err
	}
	if cp.TenantID.AccountID == 0 && cp.TenantID.ProjectID == 0 {
		tenantID, err := logstorage.ParseTenantID(*splunkTenantID)
		if err != nil {
			return nil, fmt.Errorf("cannot parse -splunk.tenantID=%q for splunk: %w", *splunkTenantID, err)
		}
		cp.TenantID = tenantID
	}

	if !cp.IsTimeFieldSet {
		cp.TimeFields = []string{*splunkTimeField}
	}
	if len(cp.StreamFields) == 0 {
		cp.StreamFields = getStreamFields()
	}
	if len(cp.IgnoreFields) == 0 {
		cp.IgnoreFields = *splunkIgnoreFields
	}
	if len(cp.MsgFields) == 0 {
		cp.MsgFields = getMsgFields()
	}
	if len(cp.PreserveJSONKeys) == 0 {
		cp.PreserveJSONKeys = *splunkPreserveJSONKeys
	}
	return cp, nil
}

func getMsgFields() []string {
	if len(*splunkMsgField) > 0 {
		return *splunkMsgField
	}
	return []string{
		"event",
		"event.log",
		"event.line",
		"event.message",
	}
}

func getStreamFields() []string {
	if len(*splunkStreamFields) > 0 {
		return *splunkStreamFields
	}
	return defaultStreamFields
}

var defaultStreamFields = []string{
	"sourcetype",
	"host",
	"source",
}

// RequestHandler processes splunk insert requests
func RequestHandler(path string, w http.ResponseWriter, r *http.Request) bool {
	switch path {
	case "/services/collector/health":
		w.WriteHeader(http.StatusOK)
	case "/services/collector/event", "/services/collector/event/1.0":
		requestHandler(w, r)
	default:
		return false
	}
	return true
}

func requestHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodOptions:
		w.WriteHeader(http.StatusOK)
		return
	case http.MethodPost:
		w.Header().Add("Content-Type", "application/json")
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	startTime := time.Now()
	requestsTotal.Inc()

	cp, err := getCommonParams(r)
	if err != nil {
		httpserver.Errorf(w, r, "%s", err)
		return
	}
	if err := insertutil.CanWriteData(); err != nil {
		httpserver.Errorf(w, r, "%s", err)
		return
	}

	encoding := r.Header.Get("Content-Encoding")
	err = protoparserutil.ReadUncompressedData(r.Body, encoding, splunkMaxRequestSize, func(data []byte) error {
		lmp := cp.NewLogMessageProcessor("splunk", true)
		defer lmp.MustClose()
		return processEvent(data, lmp, cp.TimeFields, cp.MsgFields, cp.PreserveJSONKeys)
	})
	if err != nil {
		httpserver.Errorf(w, r, "cannot read Splunk request: %s", err)
		return
	}

	requestDuration.UpdateDuration(startTime)
	fmt.Fprintf(w, `{"text":"Success","code":0}`)
}

func processEvent(data []byte, lmp insertutil.LogMessageProcessor, timeFields, msgFields, preserveKeys []string) error {
	p := logstorage.GetJSONParser()
	defer logstorage.PutJSONParser(p)

	var err error
	var n int

	p.Init(data, preserveKeys)
	for p.NextLogMessage() {
		var ts int64
		if ts, err = insertutil.ExtractTimestampFromFields(timeFields, p.Fields); err != nil {
			break
		}
		logstorage.RenameField(p.Fields, msgFields, "_msg")
		lmp.AddRow(ts, p.Fields, -1)
		n++
	}
	if err == nil {
		err = p.Error()
	}
	if err != nil {
		errorsTotal.Add(1)
		if n > 0 {
			logger.Warnf("splunk: failed to parse JSON message #%d: %s", n+1, err)
			return nil
		}
		err = fmt.Errorf("splunk: failed to parse whole event: %w", err)
	}
	return err
}

var (
	requestsTotal = metrics.NewCounter(`vl_http_requests_total{path="/insert/splunk"}`)
	errorsTotal   = metrics.NewCounter(`vl_http_errors_total{path="/insert/splunk"}`)

	requestDuration = metrics.NewSummary(`vl_http_request_duration_seconds{path="/insert/splunk"}`)
)
