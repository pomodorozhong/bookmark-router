import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Icon";

/** Native modal focus containment, Escape handling, and return to the opener. */
export function Dialog({ children, labelledBy, onClose, className = "" }: {
  children: ReactNode; labelledBy: string; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("input, textarea, select")?.focus();
    return () => { dialog.close(); opener?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={labelledBy}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    // Chrome can skip the cancel event for a dialog opened from a keystroke.
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    {children}
  </dialog>;
}

/** Every dialog's header: an optional small label, the title, and a borderless close button in the corner. */
export function DialogHeader({ id, label, title, description, closeLabel = "Close", disabled, onClose }: {
  id: string; label?: ReactNode; title: ReactNode; description?: ReactNode; closeLabel?: string; disabled?: boolean;
  /** Left out where the dialog's content sits inline and has its own way back. */
  onClose?: () => void;
}) {
  return (
    <div className="modal-heading">
      <div className="modal-title">
        {label && <div className="eyebrow">{label}</div>}
        <h2 id={id}>{title}</h2>
        {description && <p className="subtle">{description}</p>}
      </div>
      {onClose && <IconButton className="modal-close" label={closeLabel} icon="close" size={17} disabled={disabled} onClick={onClose} />}
    </div>
  );
}
