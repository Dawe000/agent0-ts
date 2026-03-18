# MCP Support Specification (agent0 SDK)

This document specifies how MCP (Model Context Protocol) support will be designed in the agent0 TypeScript SDK. **No implementation is described here**—this is a design specification so that future implementation follows the same patterns as the existing A2A (Agent-to-Agent) support.

## 1. Goals and non-goals

### Goals

- **Use tools from agent objects** — Call MCP tools directly from an `Agent` instance (e.g. `agent.mcp.get_weather(args)`), analogous to `agent.messageA2A()` for A2A.
- **MCP client from summary** — Create an MCP client from an `AgentSummary` (e.g. `sdk.createMCPClient(summary)`), resolving the MCP endpoint from `summary.mcp` on first use, mirroring `createA2AClient(agentOrSummary)`.
- **x402 integration** — MCP HTTP/SSE requests that return 402 Payment Required should be handled via the same x402 flow as A2A (inspect payment requirements, then `pay()` or `payFirst()` and retry).
- **Alignment with MCP spec** — The design follows the protocol defined in [docs/mcp/](docs/mcp/) (transports, JSON-RPC methods, tool/prompt/resource semantics).
- **Multiple transports** — Support different MCP transports in the same spirit as A2A’s binding flexibility (HTTP+JSON, JSON-RPC, etc.): the SDK design is transport-open and should support at least one transport (e.g. Streamable HTTP for remote agents), with room for stdio or others as needed.

### Non-goals (for this document)

- **Full MCP protocol spec** — That lives in [docs/mcp/](docs/mcp/) (specification-2025-06-18, seps).
- **MCP server implementation** — This spec covers the SDK as an MCP **client** only.
- **Transport deep-dive** — Only the surface the SDK needs (tool call, optional prompts/resources, x402) is specified here.

---

## 2. A2A parity (reference implementation)

MCP support in the SDK should mirror the existing A2A implementation. The following references are the patterns to follow.

### Agent surface

- **Existing**: `Agent` already exposes `mcpEndpoint`, `mcpTools`, `mcpPrompts`, `mcpResources`, and `setMCP()` (see [src/core/agent.ts](src/core/agent.ts)).
- **To add**: **Calling** tools (and optionally prompts/resources) from the agent. The API should feel like using `agent.messageA2A()`, `agent.listTasks()`, and `agent.loadTask()`—methods on the agent that perform protocol operations against the configured endpoint.

### Client from summary

- **Pattern**: Same as [A2AClientFromSummary](src/core/a2a-summary-client.ts).
- **Factory**: e.g. `sdk.createMCPClient(agentOrSummary)` accepting `Agent | AgentSummary`. When given an `Agent`, return the agent (or its MCP handle). When given an `AgentSummary`, return an MCP client that resolves the endpoint from `summary.mcp` (or the agent’s MCP endpoint when the argument is an `Agent`).
- **Lazy resolution**: Resolve the MCP endpoint and capabilities on first use (e.g. first tool call or `listTools()`); `listTools()` runs MCP `tools/list` and may cache the result, similar to `_ensureResolved()` in the A2A summary client.

### x402

- MCP requests that result in HTTP 402 must be handled via the same `requestWithX402` / `getX402RequestDeps()` flow used in [src/core/a2a-client.ts](src/core/a2a-client.ts) and [src/core/x402-request.ts](src/core/x402-request.ts).
- **Spec**: When the SDK has x402 dependencies configured, MCP tool (and optionally resource/prompt) requests must go through this stack: on 402, return `{ x402Required: true, x402Payment }` and allow the caller to `pay()` or `payFirst()` and retry, rather than throwing.

### Transports (transport-open design)

Like the A2A implementation, which supports multiple bindings (HTTP+JSON, JSON-RPC, GRPC, AUTO with fallback), the MCP client design should be **transport-open**:

- **MCP transports** are defined in [docs/mcp/specification-2025-06-18/basic/transports.mdx](docs/mcp/specification-2025-06-18/basic/transports.mdx): **stdio** (subprocess, for local servers) and **Streamable HTTP** (POST/GET, SSE, for remote servers). Custom transports are also allowed by the protocol.
- The SDK should support at least one transport that fits remote agents (typically **Streamable HTTP** when the endpoint is an HTTP URL). Support for **stdio** (e.g. when the endpoint describes a local command) and other transports may be added as needed.
- Endpoint value or metadata may indicate which transport to use (e.g. `http(s)://` → Streamable HTTP; a future convention for stdio). The client resolves the transport on first use, analogous to A2A’s binding resolution.

### Authentication

- **A2A** uses AgentCard `securitySchemes` and `security` (OpenAPI-style); the SDK’s `applyCredential()` turns `options.credential` (string or object) into headers/query params. That mechanism is **AgentCard-specific**.
- **MCP** has its own auth model: for **HTTP-based transports**, the spec defines optional [OAuth 2.1 / Protected Resource Metadata](docs/mcp/specification-2025-06-18/basic/authorization.mdx); for **stdio**, credentials typically come from the environment.
- The SDK can still follow the same **pattern** as A2A: accept credentials via options (e.g. `options.credential` or `options.auth`) and apply them to MCP requests. For HTTP, that may be a bearer token or API key; for full OAuth flows, implementation would follow MCP’s authorization spec (discovery, tokens). So we **borrow the pattern** (credentials in options, applied to requests), not the literal A2A schema. When an MCP server requires auth, the client should support passing credentials in and, where applicable, respect MCP’s OAuth discovery.

### Session handling (lazy by default; session object when server uses sessions)

MCP requires an **initialization** handshake before other requests. For Streamable HTTP, the server **MAY** return an `Mcp-Session-Id` header; if so, the client must send that ID on all subsequent requests. Design:

- **Default (easy path):** Lazy init on first use. No explicit “connect” step: the first call to `agent.mcp.listTools()`, `agent.mcp.get_weather()`, etc. runs MCP initialize, stores any `Mcp-Session-Id` internally, and reuses that state for all later calls. So `agent.mcp.*` just works.
- **When the server returns a session ID:** Same lazy init, but when `Mcp-Session-Id` is present the SDK **creates a session object** and attaches it (e.g. `agent.mcp.session`). That object:
  - Exposes the same surface (e.g. `session.listTools()`, `session.call(name, args)`, `session.prompts`, `session.resources`) so callers can pass it around.
  - Exposes `session.id` (the Mcp-Session-Id) for resuming elsewhere (e.g. `createMCPClient(summary, { sessionId: agent.mcp.session.id })`).
  - Exposes `session.close()` to explicitly terminate the session (e.g. HTTP DELETE with `Mcp-Session-Id` when supported).
- If the server never sends a session ID, `agent.mcp.session` remains undefined; no session object is created. One code path; the session object exists only when the protocol has a session.
- **Multiple sessions** to the same server (one agent): the default is one implicit session per agent. For a second session, provide an explicit way to create another (e.g. `agent.mcp.connect()` or `createMCPClient(..., { newSession: true })`) that runs a new initialize and returns a new session object.

---

## 3. One MCP server, many tools — and `agent.mcp.toolname`

One MCP server exposes **many** tools (e.g. via `tools/list`). The SDK already crawls these and stores tool names in `mcpTools` (see [src/core/endpoint-crawler.ts](src/core/endpoint-crawler.ts) and [src/models/interfaces.ts](src/models/interfaces.ts) for `AgentSummary.mcpTools`).

### Proposed API

- **Dot notation for identifier-safe names**  
  `agent.mcp.<toolname>` for tool names that are valid JavaScript identifiers (e.g. `get_weather`, `getUser`, `read_file`). Each such property is a callable: e.g. `agent.mcp.get_weather(args)`.

- **Arbitrary tool names**  
  MCP tool names may include `-`, `.`, `/` (see [docs/mcp/seps/986-specify-format-for-tool-names.md](docs/mcp/seps/986-specify-format-for-tool-names.md)). Those are not valid for dot access. Support them via:
  - **Bracket access**: `agent.mcp.tools["name"]` for any tool name—use square brackets and a string (e.g. `agent.mcp.tools["my-tool"]`, `agent.mcp.tools["user-profile/update"]`). Returns a callable; call it with `(args)`.
- **Generic call**: `agent.mcp.call(name, args)` when the name is in a variable.

**Listing tools**: `agent.mcp.listTools()` (or `agent.mcp.tools.list()`) returns the list of tool descriptors from the server (MCP `tools/list`). The SDK may cache this after first resolution; use it to discover names before calling.

So: every resolved tool is callable; **identifier-safe** names get `agent.mcp.toolname`; **all names** via `agent.mcp.tools[name]` or `agent.mcp.call(name, args)`; **list** via `agent.mcp.listTools()`.

---

## 4. Usage examples

The following examples illustrate the proposed API (no implementation yet).

### Tools from an `Agent`

```typescript
// Agent already has MCP endpoint (and optionally cached tools from registration or setMCP).
const agent = await sdk.getAgent(agentId);

// List available tools (MCP tools/list); may be cached after first use
const toolDescriptors = await agent.mcp.listTools();

// Dot access when the tool name is a valid JS identifier (letters, numbers, underscore)
const result = await agent.mcp.get_weather({ location: 'London', unit: 'celsius' });

// For names with dashes, dots, or slashes: use .call(name, args) (always works), or bracket
// notation:  agent.mcp.tools  [ "tool-name" ]  (args)  — square brackets around the quoted name.
const out = await agent.mcp.call("my-tool", { key: 'value' });
const data = await agent.mcp.call("user-profile/update", { userId: '123', name: 'Alice' });

// Generic call when the name is in a variable
const toolName = 'user-profile/update';
const updated = await agent.mcp.call(toolName, { userId: '123', name: 'Alice' });
```

### MCP client from a summary

```typescript
// From search/discovery: you have an AgentSummary with summary.mcp set.
const results = await sdk.searchAgents({ mcpTools: ['get_weather'] });
const summary = results[0];

const mcpClient = sdk.createMCPClient(summary);
// Same surface as agent.mcp: tools, call(name, args), and dot access for identifier-safe names
const weather = await mcpClient.get_weather({ location: 'Paris' });
const viaCall = await mcpClient.call('get_weather', { location: 'Paris' });
```

### Prompts (list + get → messages)

```typescript
// Prompts are templates: get(name, arguments) returns messages to send to an LLM, not a "result".
const prompts = await agent.mcp.prompts.list();
const { messages } = await agent.mcp.prompts.get('code_review', { code: 'def foo(): pass' });
// messages: [{ role: 'user', content: { type: 'text', text: '...' } }, ...]
// If the prompt name is identifier-safe, optional shorthand:
const { messages: msgs } = await agent.mcp.prompts.code_review({ code: 'def foo(): pass' });
```

### Resources (list + read by URI)

```typescript
// Resources are data identified by URI; read(uri) returns contents.
const list = await agent.mcp.resources.list();
const contents = await agent.mcp.resources.read('file:///project/readme.md');
// contents: { contents: [{ uri, mimeType, text? }] }
// Optional: resource templates (parameterized URIs)
const templates = await agent.mcp.resources.templates?.list();
const tplContent = await agent.mcp.resources.templates?.read('file:///repo/{branch}/readme.md', { branch: 'main' });
```

### Auth (credentials in options)

```typescript
// Same pattern as A2A: pass credential in options; SDK applies it to requests.
// For MCP HTTP, this may be bearer token or apiKey; OAuth follows MCP's authorization spec.
const result = await agent.mcp.get_weather(
  { location: 'London' },
  { credential: process.env.MCP_API_KEY }
);
const mcpClient = sdk.createMCPClient(summary, { credential: 'Bearer ...' });
```

### Session (when server returns Mcp-Session-Id)

```typescript
// Default: just use agent.mcp; init happens on first call. No session object unless the server sends one.
const result = await agent.mcp.get_weather({ location: 'London' });

// If the server returned Mcp-Session-Id, agent.mcp.session is set. Use it to pass the connection around or close it.
if (agent.mcp.session) {
  const sessionId = agent.mcp.session.id;       // e.g. for resuming elsewhere
  await someOtherModule.useSession(agent.mcp.session);
  agent.mcp.session.close();                    // optional: explicit session teardown
}

// Resuming elsewhere: create a client that reuses a previous session ID
const resumed = sdk.createMCPClient(summary, { sessionId: agent.mcp.session?.id });
```

### Handling 402 (payment required)

```typescript
const result = await agent.mcp.get_weather({ location: 'London' });

if (result.x402Required) {
  const payment = result.x402Payment;
  // Inspect payment options, then pay and retry
  const accept = payment.accepts[0];
  const data = await payment.pay(accept);
  // data is the tool result after successful payment
} else {
  // data is the tool result
  const data = result;
}
```

---

## 5. Data flow

### Agent path

1. `Agent` has an MCP endpoint (and optionally a cached tool/prompt/resource list from the endpoint crawler).
2. On first use, run MCP **initialize**; resolve **transport** (e.g. Streamable HTTP); apply **auth** when `options.credential` or equivalent is provided.
3. If the server returns `Mcp-Session-Id`, create a **session object** and attach it as `agent.mcp.session`; otherwise keep state internal only.
4. Expose `agent.mcp` with tools, prompts, and resources (list/get, list/read, list/call as in §7). Each request uses the same transport and, when present, session ID; when configured, x402 and credentials are applied.

### Summary path

1. `AgentSummary` has a `mcp` URL (and optionally `mcpTools`, `mcpPrompts`, `mcpResources` from discovery).
2. `createMCPClient(summary)` (optionally with default credentials) returns a client that resolves transport and capabilities on first use.
3. The client exposes the same surface: tools (call / dot / bracket), prompts (list, get), resources (list, read).
4. All requests use the SDK’s x402 stack and auth when configured.

---

## 6. Dependencies

- **MCP spec**: The protocol docs under [docs/mcp/](docs/mcp/) are the source of truth: [transports](docs/mcp/specification-2025-06-18/basic/transports.mdx) (stdio, Streamable HTTP), [authorization](docs/mcp/specification-2025-06-18/basic/authorization.mdx) (OAuth 2.1 for HTTP), JSON-RPC methods (`tools/list`, `tools/call`, `prompts/list`, `prompts/get`, `resources/list`, `resources/read`).
- **Existing SDK pieces**:
  - Endpoint crawler: `fetchMcpCapabilities`, `tools/list`, etc. (see [src/core/endpoint-crawler.ts](src/core/endpoint-crawler.ts)).
  - Summary/registration: `AgentSummary.mcp`, `mcpTools`, `mcpPrompts`, `mcpResources` ([src/models/interfaces.ts](src/models/interfaces.ts)).
  - x402: `requestWithX402`, `getX402RequestDeps()` ([src/core/x402-request.ts](src/core/x402-request.ts), SDK).

---

## 7. Prompts and resources (correct protocol semantics)

MCP distinguishes three server primitives. Tools are **model-controlled** (invoke); prompts are **user-controlled** (retrieve message templates); resources are **application-controlled** (read data by URI). The protocol verbs differ:

| Primitive | List | Retrieve / Act | Returns |
|-----------|------|----------------|---------|
| **Tools** | `tools/list` | `tools/call`(name, args) | Tool result (content/parts). |
| **Prompts** | `prompts/list` | `prompts/get`(name, arguments) | **Messages** (role + content) to send to an LLM. |
| **Resources** | `resources/list` | `resources/read`(uri) | **Contents** (e.g. text, blob) for the given URI. |

Prompts are not “called”—they are **retrieved** with arguments; the server returns one or more messages (e.g. a user message with filled-in template). Resources are **read** by URI; there are also **resource templates** (parameterized URIs) with their own list/read flow.

### Proposed API for prompts and resources

- **Prompts**: `agent.mcp.prompts.list()` → list of prompt descriptors; `agent.mcp.prompts.get(name, arguments)` → `{ messages }`. Optional dot access for identifier-safe prompt names, e.g. `agent.mcp.prompts.code_review({ code: '...' })` → messages.
- **Resources**: `agent.mcp.resources.list()` → list of resource URIs + metadata; `agent.mcp.resources.read(uri)` → contents. Optional `agent.mcp.resources.templates.list()` and read-by-template for parameterized resources.

Same surface from `createMCPClient(summary)`: `client.prompts.list()`, `client.prompts.get(name, args)`, `client.resources.list()`, `client.resources.read(uri)`. All go through the same transport and, when configured, x402 and auth.

---

## 8. Optional extensions and naming

For consistency with A2A:

- **Class**: `MCPClientFromSummary` (or equivalent) for the summary-backed client.
- **Factory**: `createMCPClient(agentOrSummary)` on the SDK.
- **Agent surface**: `agent.mcp` as the namespace for tools, prompts, and resources: `agent.mcp.listTools()` (or `agent.mcp.tools.list()`), `agent.mcp.tools[name]`, `agent.mcp.call(name, args)`, dot access for identifier-safe tool names; `agent.mcp.prompts.list()`, `agent.mcp.prompts.get(name, arguments)`; `agent.mcp.resources.list()`, `agent.mcp.resources.read(uri)`. When the server returns a session ID, `agent.mcp.session` is set (session object with same surface plus `.id` and `.close()`). For multiple sessions, `agent.mcp.connect()` (or equivalent) returns a new session object.

Modules and exports should follow the same layout as the A2A client (e.g. a dedicated MCP client module and summary-client module, reusing x402 and endpoint resolution patterns).
