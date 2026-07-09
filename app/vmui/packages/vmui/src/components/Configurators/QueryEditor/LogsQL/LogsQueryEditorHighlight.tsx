import { FC, useMemo } from "preact/compat";
import { tokenize } from "./tokenizer";

interface LogsQueryEditorHighlightProps {
  value: string;
}

const LogsQueryEditorHighlight: FC<LogsQueryEditorHighlightProps> = ({ value }) => {
  const tokens = useMemo(() => tokenize(value), [value]);

  return (
    <div
      className="vm-logsql-highlight"
      aria-hidden={true}
    >
      {tokens.map((token, i) => (
        <span
          key={i}
          className={`vm-logsql-highlight__token vm-logsql-highlight__token_${token.type}`}
        >
          {token.value}
        </span>
      ))}
    </div>
  );
};

export default LogsQueryEditorHighlight;
