import { getFromStorage, saveToStorage } from "../../../../utils/storage";
import { useSearchParams } from "react-router-dom";
import { LOGS_DEFAULT_SORT_ORDER, LOGS_SORT_ORDER, LOGS_URL_PARAMS } from "../../../../constants/logs";
import { useCallback } from "react";
import { useMemo } from "preact/compat";

export type SortOrder = typeof LOGS_SORT_ORDER[keyof typeof LOGS_SORT_ORDER];

const isSortOrder = (value: string | null): value is SortOrder => {
  return value === LOGS_SORT_ORDER.ASC || value === LOGS_SORT_ORDER.DESC;
};

export const useSortOrderController = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSortOrderFromParams = searchParams.get(LOGS_URL_PARAMS.SORT_ORDER);

  const sortOrder = useMemo(() => {
    // 1. Try URL param
    if (isSortOrder(rawSortOrderFromParams)) return rawSortOrderFromParams;

    // 2. Try session storage
    const storageSortOrder = getFromStorage("LOGS_SORT_ORDER");
    if (isSortOrder(storageSortOrder as string | null)) return storageSortOrder as SortOrder;

    // 3. Fallback
    return LOGS_DEFAULT_SORT_ORDER;
  }, [rawSortOrderFromParams]);

  const setSortOrder = useCallback((nextSortOrder: SortOrder) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set(LOGS_URL_PARAMS.SORT_ORDER, nextSortOrder);
      return next;
    });

    saveToStorage("LOGS_SORT_ORDER", nextSortOrder);
  }, [setSearchParams]);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(sortOrder === LOGS_SORT_ORDER.ASC ? LOGS_SORT_ORDER.DESC : LOGS_SORT_ORDER.ASC);
  }, [sortOrder, setSortOrder]);

  return {
    sortOrder,
    setSortOrder,
    toggleSortOrder,
  };
};
