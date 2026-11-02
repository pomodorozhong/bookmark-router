import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { connectLocalRelay, isRelayServerHello, relayResult } from "../src/agent/local-relay";
import { ensureDocumentWebMcpContext, registerAgentTools, type WebMcpContext, type WebMcpTool } from "../src/agent/webmcp";
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

function relayHarness(t: TestContext, host: Partial<WebMcpContext> = {}) {
  const sockets: FakeSocket[] = [], statuses: string[] = [];
  let retry: (() => void) | undefined;
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    closed = false;
    sent: Array<{ type: string; callId?: string; tabId?: string }> = [];
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { sockets.push(this); }
    close() { this.closed = true; }
    send(data: string) { this.sent.push(JSON.parse(data)); }
    receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  }
  for (const [key, value] of Object.entries({ WebSocket: FakeSocket,
    window: { location: { origin: "http://127.0.0.1:5331", pathname: "/", search: "" } }, document: { title: "Relay test" } })) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (before) Object.defineProperty(globalThis, key, before); else Reflect.deleteProperty(globalThis, key); });
  }
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => { retry = callback; return 1; });
  t.mock.method(globalThis, "clearTimeout", () => { retry = undefined; });
  const controller = new AbortController();
  const stop = connectLocalRelay({ registerTool() {}, getTools: async () => [], ...host }, controller.signal, (status) => statuses.push(status));
  t.after(stop);
  return { sockets, statuses, stop, reconnect() { const callback = retry; retry = undefined; assert.ok(callback); callback(); } };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test("duplicated tabs have different relay IDs and reconnects keep the same ID", async (t) => {
  const session = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: () => "copied-from-opener", setItem() {},
  } });
  t.after(() => {
    if (session) Object.defineProperty(globalThis, "sessionStorage", session);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  });
  const run = relayHarness(t), first = run.sockets[0];
  first.receive({ type: "server-hello" });
  const firstId = first.sent[0].tabId;
  assert.ok(firstId);
  first.onerror!();
  run.reconnect();
  run.sockets[1].receive({ type: "server-hello" });
  assert.equal(run.sockets[1].sent[0].tabId, firstId);

  // A second browser document loads its own module, with a copy of the opener's storage.
  const duplicate = await import(new URL("../src/agent/local-relay.ts?duplicate", import.meta.url).href);
  const stop = duplicate.connectLocalRelay({ registerTool() {} }, new AbortController().signal, () => {});
  t.after(stop);
  run.sockets[2].receive({ type: "server-hello" });
  assert.ok(run.sockets[2].sent[0].tabId);
  assert.notEqual(run.sockets[2].sent[0].tabId, firstId);
});

test("late close and error events cannot close a newer relay connection", (t) => {
  const run = relayHarness(t), first = run.sockets[0];
  const lateClose = first.onclose!, lateError = first.onerror!;
  first.onerror!(); run.reconnect();
  const second = run.sockets[1];
  lateClose(); lateError();
  assert.equal(first.closed, true);
  assert.equal(second.closed, false);
  second.receive({ type: "ping" });
  assert.deepEqual(second.sent, [{ type: "pong" }]);
});

test("stopping the relay while tool discovery is pending cannot report connected", async (t) => {
  let resolveTools!: (tools: WebMcpTool[]) => void;
  const run = relayHarness(t, { getTools: () => new Promise((resolve) => { resolveTools = resolve; }) });
  run.sockets[0].receive({ type: "hello/accepted" });
  run.stop();
  const statuses = [...run.statuses];
  resolveTools([]); await settle();
  assert.deepEqual(run.statuses, statuses);
  assert.deepEqual(run.sockets[0].sent, []);
});

test("old tool results cannot reach a reconnected relay or erase its cancellation handle", async (t) => {
  const calls: Array<{ signal: AbortSignal; resolve: (value: unknown) => void }> = [];
  const run = relayHarness(t, { executeTool: (_tool, _input, options) => new Promise((resolve) => {
    calls.push({ signal: options!.signal!, resolve });
  }) });
  const first = run.sockets[0];
  first.receive({ type: "invoke", callId: "reused", toolName: "read", args: {} });
  first.onerror!(); run.reconnect();
  assert.equal(calls[0].signal.aborted, true);
  const second = run.sockets[1];
  second.receive({ type: "invoke", callId: "reused", toolName: "read", args: {} });
  calls[0].resolve("old result"); await settle();
  assert.deepEqual(second.sent, []);
  second.receive({ type: "cancel", callId: "reused" });
  assert.equal(calls[1].signal.aborted, true);
  calls[1].resolve("new result"); await settle();
});
