export interface FrameClock {
  request(callback: () => void): number;
  cancel(id: number): void;
}

/** Coalesce updates to the latest frame, with at most one asynchronous G6 draw in flight. */
export function createDrawQueue(draw: () => Promise<void>, onError: (error: unknown) => void,
  clock: FrameClock = { request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id) }) {
  let frame: number | undefined, pending = false, drawing = false, disposed = false;
  const schedule = () => { if (!disposed && !drawing && frame === undefined) frame = clock.request(flush); };
  const flush = async () => {
    frame = undefined;
    if (disposed || !pending) return;
    pending = false; drawing = true;
    try { await draw(); } catch (error) { if (!disposed) onError(error); }
    finally { drawing = false; if (pending) schedule(); }
  };
  return {
    request() { if (!disposed) { pending = true; schedule(); } },
    cancel() { disposed = true; pending = false; if (frame !== undefined) clock.cancel(frame); frame = undefined; },
  };
}
