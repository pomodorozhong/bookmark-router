import type { ReactNode } from "react";
import { IconButton } from "./Icon";

/** The fixed bar at the top of a detail panel: moving through the queue on the left, actions on the right. */
export function DetailBar({ start, children, closeLabel, onClose }: {
  /** The phone layout's Queue button, previous / next and the position in the queue. */
  start?: ReactNode;
  /** Actions such as Copy, Edit and Pin, before the close button. */
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="detail-bar">
      <div className="detail-bar-start">{start}</div>
      <div className="detail-bar-actions">
        {children}
        <IconButton className="detail-bar-close" label={closeLabel} icon="close" size={16} onClick={onClose} />
      </div>
    </div>
  );
}
