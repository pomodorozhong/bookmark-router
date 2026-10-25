import { test } from "node:test";
import assert from "node:assert/strict";
import { isRelayServerHello, relayResult } from "../src/agent/local-relay";
import { ensureDocumentWebMcpContext, registerAgentTools, type WebMcpTool } from "../src/agent/webmcp";
import { AgentReviewSession } from "../src/domain/agent-review";
import { demoWorkspace } from "../src/domain/samples";

test("local relay status accepts only the discovery server hello", () => {
  assert.equal(isRelayServerHello({ type: "server-hello" }), true);
  assert.equal(isRelayServerHello({ type: "client-hello" }), false);
  assert.equal(isRelayServerHello(undefined), false);
  assert.equal(isRelayServerHello("server-hello"), false);
});

test("local relay preserves structured tool results", () => {
  assert.deepEqual(relayResult('{"collectionId":"demo","revision":2}'), {
    content: [{ type: "text", text: '{"collectionId":"demo","revision":2}' }],
    isError: false,
    structuredContent: { collectionId: "demo", revision: 2 },
  });
  assert.deepEqual(relayResult({ content: [{ type: "text", text: "ready" }] }), { content: [{ type: "text", text: "ready" }] });
});

test("relay adapter exposes registered tools when the runtime only supports registerTool", async () => {
  const nativeTools = new Map<string, WebMcpTool>();
  const nativeContext = {
    registerTool(tool: WebMcpTool) { nativeTools.set(tool.name, tool); },
    unregisterTool(tool: WebMcpTool | string) { nativeTools.delete(typeof tool === "string" ? tool : tool.name); },
  };
  const doc = { modelContext: nativeContext } as unknown as Document;
  const context = ensureDocumentWebMcpContext(doc)!;
  assert.notEqual(context, nativeContext);
  const handle = await registerAgentTools({ session: new AgentReviewSession(), getWorkspace: async () => demoWorkspace() }, context);
  assert.equal((await context.getTools?.())?.length, 7);
  assert.match(String(await context.executeTool?.("get_collection_context", {})), /bookmarkCount/);
  handle.dispose();
  assert.equal((await context.getTools?.())?.length, 0);
});
