import { useMemo } from "preact/compat";
import { useSearchParams } from "react-router-dom";
import { UseQueryPageControllerProps } from "../useQueryPageController";
import { useSortOrderController } from "../../../../components/Configurators/LogsSortOrderController/hooks/useSortOrderController";

export const useLogsTriggers = ({ beforeFetch }: UseQueryPageControllerProps) => {
  const [searchParams] = useSearchParams();
  const { sortOrder } = useSortOrderController();

  const isLogsHidden = searchParams.get("hide_logs") === "true";

  return useMemo(() => ({
    beforeFetch,
    isLogsHidden,
    sortOrder,
  }), [beforeFetch, isLogsHidden, sortOrder]);
};
