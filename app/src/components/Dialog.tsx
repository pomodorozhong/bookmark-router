import { useEffect, useRef, type ReactNode } from "react";

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
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    {children}
  </dialog>;
}
