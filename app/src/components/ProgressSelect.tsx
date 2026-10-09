import { progressLabels, progressStatuses } from "../data/progress";
import type { ProgressStatus } from "../data/types";

export function ProgressSelect({
  label = "Progress",
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: ProgressStatus;
  onChange: (value: ProgressStatus) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-label mt-3">
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ProgressStatus)}
      >
        {progressStatuses.map((status) => (
          <option key={status} value={status}>
            {progressLabels[status]}
          </option>
        ))}
      </select>
    </label>
  );
}
