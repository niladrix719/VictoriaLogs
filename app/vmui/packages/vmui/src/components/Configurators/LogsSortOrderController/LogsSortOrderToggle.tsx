import { FC } from "preact/compat";
import Button from "../../Main/Button/Button";
import Tooltip from "../../Main/Tooltip/Tooltip";
import { SortIcon } from "../../Main/Icons";
import useDeviceDetect from "../../../hooks/useDeviceDetect";
import { LOGS_SORT_ORDER } from "../../../constants/logs";
import { useSortOrderController } from "./hooks/useSortOrderController";
import { hasCustomSortPipe } from "./utils";

interface Props {
  query: string;
}

const LogsSortOrderToggle: FC<Props> = ({ query }) => {
  const { isMobile } = useDeviceDetect();
  const { sortOrder, toggleSortOrder } = useSortOrderController();

  // The query orders the results on its own, so the toggle has no effect on it.
  const isOverriddenByQuery = hasCustomSortPipe(query);
  const isAsc = sortOrder === LOGS_SORT_ORDER.ASC;
  const label = isAsc ? "Oldest first" : "Newest first";

  const title = isOverriddenByQuery
    ? "The query defines its own order"
    : `Sorted by _time, ${isAsc ? "ascending" : "descending"}. Click to show ${isAsc ? "newest" : "oldest"} first.`;

  return (
    <Tooltip title={title}>
      <Button
        variant="text"
        color={isAsc ? "primary" : "gray"}
        startIcon={<SortIcon/>}
        onClick={toggleSortOrder}
        disabled={isOverriddenByQuery}
        aria-label={`Sort logs by _time, currently ${label}`}
      >
        {!isMobile && label}
      </Button>
    </Tooltip>
  );
};

export default LogsSortOrderToggle;
