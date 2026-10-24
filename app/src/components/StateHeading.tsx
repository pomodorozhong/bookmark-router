import { IconButton } from "./Icon";
import { stateLabels, type StateTab } from "../domain/triage";

/** A list group's heading: its queue tab, how many it holds, and Copy for just those bookmarks. */
export function StateHeading({ tab, count, onCopy }: { tab: StateTab; count: number; onCopy: () => void }) {
  return (
    <div className={`state-heading state-${tab}`}>
      <span className="state-dot" aria-hidden="true" />
      <span>{stateLabels[tab]}</span>
      <span className="state-count">{count}</span>
      <IconButton label={`Copy ${stateLabels[tab]} (${count})…`} icon="copy" size={14} className="state-copy" onClick={onCopy} />
    </div>
  );
}
