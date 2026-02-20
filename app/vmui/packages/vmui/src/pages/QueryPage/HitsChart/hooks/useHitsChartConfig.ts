import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "preact/compat";
import { LOGS_LIMIT_HITS, WITHOUT_GROUPING } from "../../../../constants/logs";

enum  HITS_PARAMS {
  TOP = "top_hits",
  GROUP = "group_hits",
  STEP = "step",
}

export const useHitsChartConfig = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const topHits = useMemo(() => {
    const n = Number(searchParams.get(HITS_PARAMS.TOP));
    return Number.isFinite(n) && n > 0 ? n : LOGS_LIMIT_HITS;
  }, [searchParams]);

  const step = useMemo(() => {
    return searchParams.get(HITS_PARAMS.STEP);
  }, [searchParams]);

  const groupFieldHits = searchParams.get(HITS_PARAMS.GROUP) || WITHOUT_GROUPING;

  const setValue = useCallback((param: HITS_PARAMS, newValue?: string | number) => {
    setSearchParams(prev => {
      const prevValue = prev.get(param);

      const nextValue = String(newValue);
      const isEqual = nextValue === prevValue;
      if (isEqual) return prev;

      const next = new URLSearchParams(prev);
      !nextValue ? next.delete(param) : next.set(param, nextValue);
      return next;
    });
  }, [setSearchParams]);

  const setTopHits = useCallback((value?: number) => {
    setValue(HITS_PARAMS.TOP, value);
  }, [setValue]);

  const setGroupFieldHits = useCallback((value?: string) => {
    setValue(HITS_PARAMS.GROUP, value);
  }, [setValue]);

  const setStep = useCallback((value?: string) => {
    setValue(HITS_PARAMS.STEP, value);
  }, [setValue]);

  return {
    topHits: { value: topHits, set: setTopHits },
    groupFieldHits: { value: groupFieldHits, set: setGroupFieldHits },
    step: { value: step, set: setStep },
  };
};
