import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export interface ToastMessage {
  /** Changes for every new message, so the timer restarts even when the text repeats. */
  id: number;
  text: string;
  undo?: () => void;
  error?: boolean;
}
const visibleMs = 6000;

/** The one message line: what just happened, with Undo when it can be undone. Hides after 6 seconds unless hovered; errors stay until closed. */
export function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const remaining = useRef(visibleMs), started = useRef(0), timer = useRef<number>(undefined);
  const close = useRef(onClose);
  close.current = onClose;
  const start = () => {
    if (toast.error) return;
    started.current = Date.now();
    timer.current = window.setTimeout(() => close.current(), remaining.current);
  };
  const pause = () => {
    window.clearTimeout(timer.current);
    if (!toast.error) remaining.current -= Date.now() - started.current;
  };
  useEffect(() => {
    remaining.current = visibleMs;
    start();
    return () => window.clearTimeout(timer.current);
  }, [toast.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Done: Some title" reads as a bold action and its subject.
  const split = toast.text.indexOf(": ");
  return (
    <div className={`app-toast ${toast.error ? "error" : ""}`} role={toast.error ? "alert" : "status"} onMouseEnter={pause} onMouseLeave={start}>
      <span className="app-toast-text" title={toast.text}>
        {split > 0 ? <><strong>{toast.text.slice(0, split)}</strong> · {toast.text.slice(split + 2)}</> : toast.text}
      </span>
      {toast.undo && <button className="app-toast-undo" onClick={() => { toast.undo!(); }}>Undo</button>}
      <button className="app-toast-close" aria-label="Dismiss" onClick={onClose}><Icon name="close" size={14} /></button>
    </div>
  );
}
