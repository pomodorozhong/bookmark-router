import { useEffect, useRef } from "react";

/** On small screens panels behave as dismissible sheets, including keyboard focus. */
export function usePanelFocus(open: boolean, selector: string, breakpoint: number, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    let release = () => {};
    const activate = () => {
      release();
      if (!media.matches) return;
      const panel = document.querySelector<HTMLElement>(selector);
      if (!panel) return;
      const opener = document.activeElement as HTMLElement | null;
      const inert: HTMLElement[] = [];
      let branch: HTMLElement = panel;
      while (branch.parentElement && branch.parentElement !== document.body) {
        for (const sibling of branch.parentElement.children) {
          if (sibling instanceof HTMLElement && sibling !== branch && !sibling.inert && !sibling.matches('.panel-toggle, .nav-scrim, dialog')) {
            sibling.inert = true;
            inert.push(sibling);
          }
        }
        branch = branch.parentElement;
      }
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', selector === '#left-panel' ? 'Navigation' : 'Details');
      const targets = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, summary, [tabindex="0"]')).filter((el) => el.getClientRects().length);
      const keydown = (event: KeyboardEvent) => {
        if (document.querySelector('dialog[open]')) return;
        if (event.key === 'Escape') { event.preventDefault(); close.current(); }
        if (event.key !== 'Tab') return;
        const items = targets();
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      };
      targets()[0]?.focus();
      document.addEventListener('keydown', keydown);
      release = () => { inert.forEach((el) => { el.inert = false; }); panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); panel.removeAttribute("aria-label"); document.removeEventListener('keydown', keydown); if (opener?.isConnected) opener.focus(); };
    };
    activate();
    media.addEventListener('change', activate);
    return () => { release(); media.removeEventListener('change', activate); };
  }, [open, selector, breakpoint]);
}
