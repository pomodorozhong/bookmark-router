import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { graphLayoutDefaults, type GraphLayoutSettings } from "../data/graph";

function sameSettings(a: GraphLayoutSettings, b: GraphLayoutSettings) {
  return Object.keys(graphLayoutDefaults).every(
    (key) =>
      a[key as keyof GraphLayoutSettings] ===
      b[key as keyof GraphLayoutSettings],
  );
}

function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-sm font-medium">
        <span>{label}</span>
        <output className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
          {display ? display(value) : value}
        </output>
      </span>
      <input
        className="!h-2 !cursor-pointer !rounded-full !border-0 !bg-slate-200 !px-0 !py-0 !accent-emerald-700"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="mt-1 block text-xs leading-5 text-slate-500">
        {hint}
      </span>
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {hint}
        </span>
      </span>
    </label>
  );
}

export function LayoutTuning({
  value,
  onApply,
  close,
}: {
  value: GraphLayoutSettings;
  onApply: (value: GraphLayoutSettings) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [iterationsText, setIterationsText] = useState(() =>
    String(value.iterations),
  );
  const closeButton = useRef<HTMLButtonElement>(null);
  const changed = !sameSettings(value, draft);
  const parsedIterations = Number(iterationsText.trim());
  const iterationsInvalid =
    !/^\d+$/.test(iterationsText.trim()) ||
    !Number.isSafeInteger(parsedIterations) ||
    parsedIterations < 20 ||
    parsedIterations > 10000;
  useEffect(() => {
    setDraft(value);
    setIterationsText(String(value.iterations));
  }, [value]);
  useEffect(() => closeButton.current?.focus(), []);
  const update = <K extends keyof GraphLayoutSettings>(
    key: K,
    next: GraphLayoutSettings[K],
  ) => setDraft((current) => ({ ...current, [key]: next }));

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="layout-tuning-title"
      className="fixed left-17 top-23 z-40 w-96 max-w-[calc(100vw-5rem)] max-h-[calc(100dvh-7rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="layout-tuning-title" className="font-semibold">
          Graph layout tuning
        </h2>
        <button
          ref={closeButton}
          aria-label="Close graph layout tuning"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Tune the ForceAtlas2 layout and circle spacing. Changes apply when you
        relayout and are saved with this dataset’s browser preferences.
      </p>

      <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
        <RangeField
          label="Repulsion / spread"
          hint="Increase to spread nodes farther apart."
          value={draft.scalingRatio}
          min={1}
          max={200}
          step={1}
          onChange={(v) => update("scalingRatio", v)}
        />
        <RangeField
          label="Center gravity"
          hint="Increase to keep the graph more compact around its center."
          value={draft.gravity}
          min={0}
          max={5}
          step={0.05}
          display={(v) => v.toFixed(2)}
          onChange={(v) => update("gravity", v)}
        />
        <RangeField
          label="Motion damping"
          hint="Higher damping reduces movement speed; the settle time below controls when it stops."
          value={draft.slowDown}
          min={0.5}
          max={50}
          step={0.5}
          onChange={(v) => update("slowDown", v)}
        />
        <div>
          <label className="block text-xs font-medium">
            Initial layout iterations
            <input
              type="text"
              inputMode="numeric"
              aria-label="Initial layout iterations"
              aria-invalid={iterationsInvalid}
              className={
                iterationsInvalid
                  ? "!border-red-500 !text-red-600 !ring-red-100"
                  : ""
              }
              value={iterationsText}
              onChange={(event) => {
                const text = event.target.value;
                setIterationsText(text);
                const next = Number(text.trim());
                if (
                  /^\d+$/.test(text.trim()) &&
                  Number.isSafeInteger(next) &&
                  next >= 20 &&
                  next <= 10000
                )
                  update("iterations", next);
              }}
            />
          </label>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Used for first layout and deliberate re-layout. Higher values take
            longer.
          </span>
          {iterationsInvalid && (
            <span className="mt-1 block text-xs text-red-600">
              Enter a whole number from 20 to 10,000.
            </span>
          )}
        </div>
        <RangeField
          label="Live settle time"
          hint="How long physics runs after dragging or applying settings."
          value={draft.settleDurationMs}
          min={250}
          max={10000}
          step={50}
          display={(v) => `${(v / 1000).toFixed(2)} s`}
          onChange={(v) => update("settleDurationMs", v)}
        />
        <RangeField
          label="Minimum circle gap"
          hint="Adds space between node collision circles during overlap correction."
          value={draft.overlapGap}
          min={0}
          max={60}
          step={1}
          onChange={(v) => update("overlapGap", v)}
        />
        <RangeField
          label="Overlap correction passes"
          hint="Set to 0 to turn off the explicit overlap correction."
          value={draft.overlapPasses}
          min={0}
          max={20}
          step={1}
          display={(v) => (v === 0 ? "Off" : String(v))}
          onChange={(v) => update("overlapPasses", v)}
        />
        {draft.edgeWeightsEnabled && (
          <RangeField
            label="Edge weight influence"
            hint="Controls how strongly selected links and center anchors affect attraction."
            value={draft.edgeWeightInfluence}
            min={0}
            max={3}
            step={0.1}
            display={(v) => v.toFixed(1)}
            onChange={(v) => update("edgeWeightInfluence", v)}
          />
        )}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Toggle
          label="Size-aware repulsion"
          hint="Use node sizes when ForceAtlas2 calculates repulsion."
          checked={draft.adjustSizes}
          onChange={(v) => update("adjustSizes", v)}
        />
        <Toggle
          label="Barnes–Hut optimization"
          hint="Speeds up repulsion calculations on larger graphs."
          checked={draft.barnesHutOptimize}
          onChange={(v) => update("barnesHutOptimize", v)}
        />
        <Toggle
          label="Use edge weights"
          hint="Let stronger selected links attract more and weak center anchors attract less."
          checked={draft.edgeWeightsEnabled}
          onChange={(v) => update("edgeWeightsEnabled", v)}
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setDraft({ ...graphLayoutDefaults });
            setIterationsText(String(graphLayoutDefaults.iterations));
          }}
        >
          Restore defaults
        </button>
        <button
          className="primary"
          type="button"
          disabled={!changed || iterationsInvalid}
          onClick={() => onApply({ ...draft })}
        >
          Apply and re-layout
        </button>
      </div>
    </section>
  );
}
