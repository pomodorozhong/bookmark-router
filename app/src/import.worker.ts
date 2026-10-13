import { parseImport, type Format } from './domain/imports';
self.onmessage = (event: MessageEvent<{ id: number; text: string; format: Format; filename: string }>) => {
  try { self.postMessage({ id: event.data.id, parsed: parseImport(event.data.text, event.data.format, event.data.filename) }); }
  catch (error) { self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }); }
};
