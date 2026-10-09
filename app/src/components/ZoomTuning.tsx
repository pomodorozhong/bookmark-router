import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import {
  zoomDetailDefaults,
  type ZoomDetails,
  type ZoomDetailKey,
} from "../data/zoom-details";
const rows: { key: ZoomDetailKey; label: string }[] = [
  { key: "bookmarkTitle", label: "Bookmark titles" },
  { key: "bookmarkSubtitle", label: "Bookmark source & status" },
  { key: "bookmarkSymbol", label: "Bookmark symbols" },
  { key: "hubTitle", label: "Hub titles" },
  { key: "hubType", label: "Hub type badges" },
  { key: "hubSubtitle", label: "Hub descriptions" },
];
function makeDraft(value: ZoomDetails) {
  return Object.fromEntries([
    ["maxZoom", String(value.maxZoom * 100)],
    ...rows.flatMap(({ key }) =>
      (["start", "end"] as const).map((part) => [
        `${key}.${part}`,
        String(value[key][part] * 100),
      ]),
    ),
  ]);
}
function percentage(text: string) {
  return text.trim() && /^\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN;
}
export function ZoomTuning({
  value,
  zoom,
  onChange,
  close,
}: {
  value: ZoomDetails;
  zoom: number;
  onChange: (value: ZoomDetails) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => makeDraft(value));
  const max = percentage(draft.maxZoom);
  const maxInvalid =
    !Number.isFinite(max) ||
    max < 9 ||
    max > 10000 ||
    rows.some(({ key }) => max < value[key].end * 100);
  const pairValid = (
    key: ZoomDetailKey,
    next = draft,
    limit = value.maxZoom * 100,
  ) => {
    const start = percentage(next[`${key}.start`]),
      end = percentage(next[`${key}.end`]);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 8 &&
      end > start &&
      end <= limit
    );
  };
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
  }, []);
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="zoom-tuning-title"
      className="fixed left-17 top-23 z-40 w-85 max-w-[calc(100vw-5rem)] max-h-[calc(100dvh-7rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="zoom-tuning-title" className="font-semibold">
          Zoom detail tuning
        </h2>
        <button
          ref={closeButton}
          aria-label="Close zoom tuning"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Zoom the canvas while tuning. Details are hidden at or below “Hidden”;
        they fade in until “Full”.
      </p>
      <p className="mt-3 text-sm font-medium tabular-nums">
        Current zoom: {Math.round(zoom * 100)}%
      </p>
      <label className="mt-4 block text-xs font-medium">
        Maximum zoom (%)
        <input
          type="text"
          inputMode="decimal"
          aria-label="Maximum zoom percent"
          aria-invalid={maxInvalid}
          className={
            maxInvalid ? "!border-red-500 !text-red-600 !ring-red-100" : ""
          }
          value={draft.maxZoom}
          onChange={(e) => {
            const text = e.target.value;
            setDraft({ ...draft, maxZoom: text });
            const next = percentage(text);
            if (
              Number.isFinite(next) &&
              next >= 9 &&
              next <= 10000 &&
              rows.every(({ key }) => next >= value[key].end * 100)
            ) {
              const settings = { ...value, maxZoom: next / 100 };
              for (const { key } of rows) {
                if (pairValid(key, draft, next))
                  settings[key] = {
                    start: percentage(draft[`${key}.start`]) / 100,
                    end: percentage(draft[`${key}.end`]) / 100,
                  };
              }
              onChange(settings);
            }
          }}
        />
      </label>
      <div className="mt-4 space-y-4">
        {rows.map(({ key, label }) => (
          <fieldset key={key}>
            <legend className="mb-2 text-xs font-medium">{label}</legend>
            <div className="grid grid-cols-2 gap-3">
              {(["start", "end"] as const).map((part) => (
                <label key={part} className="text-xs text-slate-500">
                  {part === "start" ? "Hidden (%)" : "Full (%)"}
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${label} ${part === "start" ? "hidden" : "full"} zoom percent`}
                    aria-invalid={!pairValid(key)}
                    className={
                      !pairValid(key)
                        ? "!border-red-500 !text-red-600 !ring-red-100"
                        : ""
                    }
                    value={draft[`${key}.${part}`]}
                    onChange={(e) => {
                      const next = {
                        ...draft,
                        [`${key}.${part}`]: e.target.value,
                      };
                      setDraft(next);
                      if (pairValid(key, next))
                        onChange({
                          ...value,
                          [key]: {
                            start: percentage(next[`${key}.start`]) / 100,
                            end: percentage(next[`${key}.end`]) / 100,
                          },
                        });
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <button
        className="secondary mt-5"
        onClick={() => {
          const defaults = structuredClone(zoomDetailDefaults);
          setDraft(makeDraft(defaults));
          onChange(defaults);
        }}
      >
        <RotateCcw size={14} /> Reset zoom settings
      </button>
      <p className="mt-3 text-[11px] text-slate-400">
        Red values are ignored. Hidden must be at least 8%, Full must be higher
        than Hidden, and Maximum must cover every Full value (9–10,000%). Valid
        changes apply live and are saved for this dataset.
      </p>
    </section>
  );
}
