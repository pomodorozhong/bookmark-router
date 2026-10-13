import type { Status } from "../domain/model";

export function StatusSegmentedControl({
  statuses,
  value,
  onChange,
  disabled = false,
}: {
  statuses: Status[];
  value: string;
  onChange: (statusId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="status-choice-field">
      <span className="status-choice-label">New action status</span>
      <div className="status-segmented" role="radiogroup" aria-label="New action status">
        {statuses.map((status) => (
          <button
            key={status.id}
            type="button"
            className={value === status.id ? "active" : ""}
            role="radio"
            aria-checked={value === status.id}
            disabled={disabled}
            onClick={() => onChange(status.id)}
          >
            {status.label}
          </button>
        ))}
      </div>
    </div>
  );
}
