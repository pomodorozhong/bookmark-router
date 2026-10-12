import { copyPresets } from "./domain/triage";

export type CopyScope = "selection" | "list" | "current";
export interface CopyContext {
  collectionId: string;
  selection?: string[];
  list: string[];
  current?: string;
}
export interface CopyFormat { template: string; separator: string }

// Shared by the Copy dialog and the agent; preferences belong to this device.
export function readCopyFormat(): CopyFormat {
  try {
    const saved = JSON.parse(localStorage.getItem("bookmark-tag-copy") ?? "null");
    if (typeof saved?.template === "string" && typeof saved?.separator === "string") return saved;
  } catch { /* fall back to the first preset */ }
  return copyPresets[0];
}
export function rememberCopyFormat(value: CopyFormat) {
  try { localStorage.setItem("bookmark-tag-copy", JSON.stringify(value)); } catch { /* copy still works */ }
}
