import { detectWebMcp, ensureDocumentWebMcpContext, type WebMcpContext } from "./webmcp";

export type LocalAgentStatus = "off" | "starting" | "searching" | "connected" | "failed";

const relayPort = "9333";
const relayReconnectDelay = 2000;

/** The relay announces itself as soon as a discovery WebSocket is accepted. */
export function isRelayServerHello(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as { type?: unknown }).type === "server-hello";
}
/**
 * The polyfill may expose modelContext on navigator while the page-owned relay
 * uses document.modelContext. Keep the two references joined without replacing
 * an existing native document context.
 */
export async function installLocalAgentRuntime(): Promise<WebMcpContext> {
  if (!detectWebMcp()) {
    const { initializeWebMCPPolyfill } = await import("@mcp-b/webmcp-polyfill");
    initializeWebMCPPolyfill({ installTestingShim: false });
  }
  const context = ensureDocumentWebMcpContext();
  if (!context) {
    throw new Error("WebMCP is unavailable in this browser.");
  }
  return context;
}

// Duplicated tabs copy sessionStorage. Keep this peer's identity in the page so
// separate documents get separate tools and reconnecting this one keeps its ID.
let pageRelayId: string | undefined;

export function relayResult(value: unknown): unknown {
  let normalized = value;
  if (typeof value === "string") {
    try { normalized = JSON.parse(value); } catch { /* Keep non-JSON tool output as text. */ }
  }
  if (normalized && typeof normalized === "object" && Array.isArray((normalized as { content?: unknown }).content)) return normalized;
  const text = typeof normalized === "string" ? normalized : (() => {
    try { return JSON.stringify(normalized) ?? String(normalized); } catch { return String(normalized); }
  })();
  return { content: [{ type: "text", text }], isError: false, structuredContent: normalized };
}

/**
 * Keep the relay connection in the page. This avoids a hidden cross-document
 * bridge, which is unreliable in embedded browsers, while speaking the same
 * protocol as the pinned local relay server.
 */
export function connectLocalRelay(context: WebMcpContext, signal: AbortSignal, onStatus: (status: Extract<LocalAgentStatus, "searching" | "connected">) => void): () => void {
  if (typeof WebSocket === "undefined") {
    onStatus("searching");
    return () => undefined;
  }

  let socket: WebSocket | undefined;
  let accepted = false;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const invocations = new Map<string, AbortController>();
  const tabId = pageRelayId ??= globalThis.crypto?.randomUUID?.() ?? `bookmark-tag-${Math.random().toString(36).slice(2)}`;
  const origin = window.location.origin;
  const pageUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  const current = (connection: WebSocket | undefined) => !!connection && socket === connection && !stopped && !signal.aborted;
  const send = (connection: WebSocket, message: unknown) => {
    if (current(connection) && connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify(message));
  };
  const sendTools = async (connection: WebSocket) => {
    if (!current(connection) || !accepted) return;
    if (!context.getTools) throw new Error("The local agent context cannot list tools.");
    const tools = await context.getTools();
    if (!Array.isArray(tools)) throw new Error("The local agent context returned an invalid tool list.");
    send(connection, { type: "tools/list", tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations })) });
  };
  const scheduleRetry = () => {
    if (stopped || retryTimer !== undefined) return;
    retryTimer = setTimeout(() => { retryTimer = undefined; connect(); }, relayReconnectDelay);
  };
  const retryConnection = (connection: WebSocket) => {
    if (!current(connection)) return;
    closeSocket();
    onStatus("searching");
    scheduleRetry();
  };
  const closeSocket = () => {
    const closing = socket;
    socket = undefined;
    accepted = false;
    if (closing) {
      closing.onmessage = closing.onerror = closing.onclose = null;
      closing.close();
    }
    for (const invocation of invocations.values()) invocation.abort(Error("Relay connection closed"));
    invocations.clear();
  };
  const connect = () => {
    if (stopped || signal.aborted || socket) return;
    onStatus("searching");
    try {
      const connection = socket = new WebSocket(`ws://127.0.0.1:${relayPort}`, ["webmcp-discovery.v1", "webmcp.v1"]);
      connection.onmessage = (event) => {
        if (!current(connection)) return;
        let message: unknown;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (isRelayServerHello(message)) {
          send(connection, { type: "hello", tabId, origin, title: document.title, url: pageUrl });
          return;
        }
        if (!message || typeof message !== "object") return;
        const type = (message as { type?: unknown }).type;
        if (type === "hello/accepted") {
          accepted = true;
          void sendTools(connection).then(() => { if (current(connection)) onStatus("connected"); }).catch(() => retryConnection(connection));
        } else if (type === "hello/rejected") {
          retryConnection(connection);
        } else if (type === "ping") {
          send(connection, { type: "pong" });
        } else if (type === "cancel" && typeof (message as { callId?: unknown }).callId === "string") {
          invocations.get((message as { callId: string }).callId)?.abort(Error("Tool execution cancelled"));
        } else if (type === "invoke" && typeof (message as { callId?: unknown }).callId === "string" && typeof (message as { toolName?: unknown }).toolName === "string") {
          const callId = (message as { callId: string }).callId;
          const invocation = new AbortController();
          invocations.set(callId, invocation);
          void (async () => {
            try {
              if (!context.executeTool) throw new Error("The local agent context cannot execute tools.");
              const args = (message as { args?: unknown }).args;
              const result = await context.executeTool((message as { toolName: string }).toolName, args && typeof args === "object" ? args : {}, { signal: invocation.signal });
              send(connection, { type: "result", callId, result: relayResult(result) });
            } catch (error) {
              send(connection, { type: "result", callId, result: { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true } });
            } finally {
              if (invocations.get(callId) === invocation) invocations.delete(callId);
            }
          })();
        }
      };
      connection.onerror = () => retryConnection(connection);
      connection.onclose = () => retryConnection(connection);
    } catch {
      socket = undefined;
      scheduleRetry();
    }
  };
  const toolsChanged = () => {
    const connection = socket;
    if (connection) void sendTools(connection).catch(() => retryConnection(connection));
  };
  context.addEventListener?.("toolchange", toolsChanged);
  connect();
  const stop = () => {
    stopped = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    context.removeEventListener?.("toolchange", toolsChanged);
    closeSocket();
    signal.removeEventListener("abort", stop);
  };
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
  return stop;
}
