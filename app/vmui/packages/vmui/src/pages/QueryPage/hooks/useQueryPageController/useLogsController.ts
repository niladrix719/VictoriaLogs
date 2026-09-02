import { FetchLogsParams, useFetchLogs } from "../useFetchLogs";
import { useLimitController } from "../../../../components/Configurators/LogsLimitController/hooks/useLimitController";
import { useSortOrderController } from "../../../../components/Configurators/LogsSortOrderController/hooks/useSortOrderController";
import { applySortOrder } from "../../../../components/Configurators/LogsSortOrderController/utils";
import { useRef } from "preact/compat";

export const useLogsController = () => {
  const { limit } = useLimitController();
  const { sortOrder } = useSortOrderController();

  const limitRef = useRef(limit);
  limitRef.current = limit;

  const sortOrderRef = useRef(sortOrder);
  sortOrderRef.current = sortOrder;

  const { fetchLogs, ...logsRequestState } = useFetchLogs();

  const runLogs = async (params: FetchLogsParams): Promise<boolean> => {
    logsRequestState.abort();

    try {
      const isSuccess = await fetchLogs({
        ...params,
        query: applySortOrder(params.query, sortOrderRef.current),
        limit: limitRef.current,
      });

      return Boolean(isSuccess);
    } catch {
      return false;
    }
  };

  return {
    runLogs,
    ...logsRequestState,
  };
};
