import type { ReactNode } from "react";
import { splitOffCount, type Candidate } from "../domain/connections";
import { Icon } from "./Icon";

interface Props {
  view: "tags" | "connections";
  /** Controls both views share, in the same places: tag presentation, Re-layout, and view-specific arrangement. */
  layout: ReactNode;
  /** Context shown after the controls, such as the tag clicked on the map. */
  trailing?: ReactNode;
  candidate?: Candidate;
  todo: boolean;
  canRecommend: boolean;
  /** The current bookmark is already the recommendation. */
  atBest: boolean;
  mode: "normal" | "preview";
  onBest: () => void;
  onTodo: () => void;
  onPreview: (on: boolean) => void;
}

/** Graph tools in one fixed order: the shared layout controls first, then Connections' Preview split and Best next.
    The bookmark card explains the forecast, so the bar only turns the preview on and off. */
export function ConnectionsControls({ view, layout, trailing, candidate, todo, canRecommend, atBest, mode, onBest, onTodo, onPreview }: Props) {
  const connections = view === "connections";
  const canPreview = todo && !!candidate;
  const splitOff = candidate ? splitOffCount(candidate) : 0;
  const previewing = mode === "preview";
  return <div className="graph-controls" role="region" aria-label="Graph controls">
    {layout}
    {connections && <button className="tool-toggle preview-toggle" aria-pressed={previewing} disabled={!canPreview}
      title={!canPreview ? "Pick a To triage bookmark to preview what finishing it splits" : previewing ? "Stop previewing (Esc)" : "Show on the map what finishing this bookmark splits off"}
      onClick={() => onPreview(!previewing)}>
      <Icon name="scope" size={14} /><span className="tool-label">Preview split</span>{splitOff > 0 && <span className="split-count" aria-label={`${splitOff} split off`}>{splitOff}</span>}
    </button>}
    {connections && (todo
      ? <button className="best-next" disabled={!canRecommend || atBest} title={atBest ? "This is already the best next bookmark" : "Open the best next bookmark"} onClick={onBest}>Best next <span aria-hidden="true">↗</span></button>
      : <button className="best-next" onClick={onTodo}>Untangle To triage</button>)}
    {trailing}
  </div>;
}
