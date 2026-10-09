import {
  progressLabels,
  progressStatuses,
  type ProgressFilter,
} from "../data/progress";

export function ProgressFilters({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ProgressFilter;
  onChange: (value: ProgressFilter) => void;
}) {
  return (
    <fieldset aria-label={label} className="mt-4">
      <legend className="text-xs font-medium text-slate-500">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {progressStatuses.map((status) => (
          <label
            key={status}
            className="flex cursor-pointer items-center gap-2 text-xs text-slate-600"
          >
            <input
              type="checkbox"
              checked={value.includes(status)}
              onChange={(e) => {
                const checked = e.target.checked;
                onChange(
                  progressStatuses.filter((candidate) =>
                    candidate === status ? checked : value.includes(candidate),
                  ),
                );
              }}
            />
            {progressLabels[status]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
