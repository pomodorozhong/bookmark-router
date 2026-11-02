import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidElement, Children, type ReactNode } from "react";
import { TagView } from "../src/components/TagView";
import { demoWorkspace } from "../src/domain/samples";
import type { Bookmark } from "../src/domain/model";

function copyAction(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ label?: string; onClick?: () => void; children?: ReactNode }>(child)) continue;
    if (child.props.label === "Copy…") return child.props.onClick;
    const found = copyAction(child.props.children); if (found) return found;
  }
}
test("tag Copy includes every member in displayed state/clockwise order", () => {
  const workspace = demoWorkspace(), tag = workspace.tags[0];
  workspace.bookmarks[0].statusId = "done"; workspace.bookmarks[1].statusId = "dropped";
  let copied: Bookmark[] | undefined;
  const tree = TagView({ tag, workspace, order: ["bookmark-3", "bookmark-2", "bookmark-1", "bookmark-0"], loadMedia: async () => undefined,
    onOpen() {}, onCopy(items) { copied = items; }, onCopyGroup() {}, onEdit() {}, onClose() {} });
  const copy = copyAction(tree); assert.ok(copy); copy();
  assert.deepEqual(copied!.map((b) => b.id), ["bookmark-3", "bookmark-2", "bookmark-9", "bookmark-0", "bookmark-1"]);
});
