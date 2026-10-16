import type { ReactNode } from "react";
import { IconButton } from "./Icon";

/** The fixed bar at the top of a detail panel, so its actions stay put however long the title is. */
export function DetailBar({ link, children, closeLabel, onClose }: {
  /** The record's link or URL note, truncated on the left. */
  link?: ReactNode;
  /** Actions such as Copy, Edit and Pin, before the close button. */
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="detail-bar">
      <div className="detail-bar-link">{link}</div>
      <div className="detail-bar-actions">
        {children}
        <IconButton className="detail-bar-close" label={closeLabel} icon="close" size={15} onClick={onClose} />
      </div>
    </div>
  );
}
