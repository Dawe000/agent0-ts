# SDK rundown: A2A and x402 (for agents)

This doc summarizes what we’re adding in this PR: **A2A** (Agent-to-Agent) and **x402** (HTTP 402 Payment Required). It’s written for a technical audience (e.g. marketing) and focuses on **how an agent uses the SDK**—making requests, handling payment-required responses, and deciding whether (and how) to pay.

---

## What we’re adding

1. **x402** – The SDK can call HTTP APIs that return **402 Payment Required**. Instead of failing, the SDK returns structured payment options. The agent (or the app behind it) can inspect those options, decide to pay, and the SDK retries the request with a signed payment. Result: one flow for “free” and “paid” APIs.
2. **A2A** – The SDK can talk to **other agents** over the A2A protocol: send messages, create and manage tasks, list and load tasks. If an A2A endpoint returns 402, the same x402 flow applies: the agent gets payment options and can pay then continue.
3. **Agent-first flows** – All of this is designed so an **agent** (or an app acting as one) can:
   - Make a request.
   - See a 402 and get **machine-readable payment details** (price, token, network, destination).
   - **Decide** whether to pay (e.g. by balance, user preference, or policy).
   - Pay and retry in one step and get the same success shape as a non-paid request.

---

## x402: payment-required HTTP

### What it is

Some HTTP APIs return **402 Payment Required** when the client must pay to access the resource. The server sends **payment options** (e.g. “pay 0.01 USDC on Base to this address”). The client signs a payment (e.g. EIP-3009 transfer authorization), sends it on the next request, and the server returns 200 with the resource.

### How the agent uses it

1. **Agent makes a request** (e.g. “fetch this paid API”).
2. **SDK returns a result.**  
   - If the server returns **2xx**: the result is the parsed body (e.g. JSON). Agent uses it as usual.  
   - If the server returns **402**: the result is `{ x402Required: true, x402Payment }`. The request did not throw; the agent gets a handle to pay and retry.
3. **Agent (or app) inspects payment options.**  
   `x402Payment.accepts` is an array of options. Each option has at least:
   - `price` (e.g. `"3000"` in smallest units)
   - `token` / `asset` (contract address)
   - `network` (e.g. `"eip155:8453"` for Base)
   - `destination` / `payTo` (where to send the payment)

   The agent can use this to **decide**:
   - “Do I have enough balance on this chain?”
   - “Is this price acceptable?”
   - “Which of several options (e.g. different chains) do I prefer?”
4. **Agent pays and retries.**  
   - **Automatic choice:** `await result.x402Payment.payFirst()` — SDK picks the first accept where the signer has sufficient balance and pays with it.  
   - **Explicit choice:** `await result.x402Payment.pay(0)` (first option) or `pay(1)` (second), or pass a specific accept object.  
   After a successful pay, the SDK retries the **same** request with the payment attached; the return value is the same as a normal 200 response (e.g. the API’s JSON body). Optionally the response includes `x402Settlement` (e.g. transaction hash, payer) if the server sends it.

### User flow (agent-centric)

```
Agent: "I need data from https://paid-api.example/resource"
  → sdk.request({ url, method: 'GET' })

Server returns 402 + payment options (e.g. "0.01 USDC on Base")

SDK returns: { x402Required: true, x402Payment }
  → App dumps to agent: accepts (price, token, network, destination), resource, error

Agent returns its choice: e.g. { pay: true, acceptIndex: 0 } or { pay: false, reason: "..." }

App acts on choice:
  - If pay: await result.x402Payment.pay(acceptIndex)
  - If skip: return or throw with reason
  → SDK builds signed payment (EIP-3009 style), retries request with PAYMENT-SIGNATURE
  → Server returns 200 + resource
  → pay() resolves to that resource (e.g. JSON). Agent continues as if the first request had been 200.
```

### Code sketch (agent flow)

```ts
// Agent wants to call a paid API
const result = await sdk.request({ url: 'https://paid-api.example/data', method: 'GET' });

if (result.x402Required) {
  // Server asked for payment. Agent can inspect options and decide.
  const options = result.x402Payment.accepts;
  // e.g. options[0] = { price: '3000', token: '0x...', network: 'eip155:8453', destination: '0x...' }

  // Decision: pay first option we can afford, or let user decide
  const paid = await result.x402Payment.payFirst(); // or pay(0), pay(1), etc.
  // paid = same shape as 200 response (e.g. the API JSON)
  return useData(paid);
} else {
  return useData(result);
}
```

### Agent makes a choice (x402)

The payment options (and any resource/error info) are passed to the agent; the agent returns its decision. The app then acts on that choice:

```ts
const result = await sdk.request({ url: paidApiUrl, method: 'GET' });

if (!result.x402Required) {
  return result; // Free; use response as-is.
}

// 402: dump the payment details to the agent and get its choice.
const agentChoice = await askAgent(
  'This request requires payment. Here are the options:',
  { resource: result.x402Payment.resource, error: result.x402Payment.error, accepts: result.x402Payment.accepts }
);
// agentChoice = { pay: true, acceptIndex: 0 } | { pay: false, reason: '...' }

if (!agentChoice.pay) {
  throw new Error(agentChoice.reason ?? 'Agent declined to pay.');
}

const paid = await result.x402Payment.pay(agentChoice.acceptIndex);
return paid;
```

---

## A2A: Agent-to-Agent

### What it is

**A2A** is a protocol for one agent to talk to another: send messages, create and manage tasks (long-running work), list tasks, and load a task by ID. The other agent exposes an A2A endpoint (and optionally an agent card with supported interfaces and auth). The SDK handles binding selection (e.g. HTTP+JSON), auth (API key, bearer), and request/response shapes.

### How the agent uses it

1. **Get an agent to talk to.**  
   - Load a full agent: `await sdk.loadAgent(agentId)`.  
   - Or use a summary from search: `await sdk.getAgent(agentId)` then `sdk.createA2AClient(summary)`.  
   The client (full Agent or A2AClientFromSummary) exposes the same A2A methods.
2. **Send a message.**  
   `await client.messageA2A('Hello, do task X')`  
   - If the other agent returns **200**: you get a message response or a **task** (if they created one). You can then `task.query()`, `task.message()`, `task.cancel()`.  
   - If the other agent returns **402**: you get `{ x402Required: true, x402Payment }`. Same as x402 above: inspect `x402Payment.accepts`, decide, then `x402Payment.pay()` or `payFirst()` to pay and get the success response (e.g. the task).
3. **List and load tasks.**  
   `await client.listTasks()` (optional filter, historyLength, credential).  
   `await client.loadTask(taskId)` — returns an `AgentTask` (query, message, cancel) or 402 if that endpoint is paid.
4. **402 on A2A**  
   Whenever an A2A call returns 402, the SDK gives you `x402Payment`; after pay, you get the same shape as success (e.g. `AgentTask` for `loadTask`, or message/task for `messageA2A`). So the agent flow is: “message → maybe 402 → decide → pay → continue with task/message.”

### User flow (agent-centric)

```
Agent: "I need another agent to do work"
  → client = sdk.createA2AClient(agentOrSummary)
  → result = await client.messageA2A('Please process X')

If 200:
  - Maybe result has a task → agent can task.query(), task.message(), task.cancel()
  - Maybe result is a direct message reply
If 402:
  - App dumps result.x402Payment (accepts, resource, error) to the agent
  - Agent returns choice: { pay: true, acceptIndex } or { pay: false, reason }
  - App calls pay(acceptIndex) or skips; if pay, get same shape as 200 (task or message)

Agent: "List my tasks"   → client.listTasks()
Agent: "Load task T"     → client.loadTask(taskId) → AgentTask or 402 → if 402, pay then get task
```

### Code sketch (agent flow)

```ts
const agent = await sdk.loadAgent('84532:1298');
const client = sdk.createA2AClient(agent);

const result = await client.messageA2A('Process this job.');
if (result.x402Required) {
  // Other agent charges for this. Our agent can decide based on accepts.
  const paid = await result.x402Payment.pay();
  // paid = same as success: message or task
  if ('task' in paid) await paid.task.query();
} else if ('task' in result) {
  await result.task.query();
}
```

### Agent makes a choice (A2A)

Same idea: the info is dumped to the agent; the agent returns its choice; we act on it:

```ts
const result = await client.messageA2A('Run this task.');

if (!result.x402Required) {
  return handleSuccess(result);
}

// 402: send payment options to the agent and get its choice.
const agentChoice = await askAgent(
  'The other agent requires payment to run this task. Options:',
  { accepts: result.x402Payment.accepts }
);
// agentChoice = { pay: true, acceptIndex: 0 } | { pay: false, reason: '...' }

if (!agentChoice.pay) {
  return { status: 'skipped', reason: agentChoice.reason };
}

const paid = await result.x402Payment.pay(agentChoice.acceptIndex);
return handleSuccess(paid);
```

---

## Putting it together: agent decision points

- **Single place to handle “paid or not”.**  
  The agent always calls one method (e.g. `sdk.request` or `client.messageA2A`). If the server returns 402, the agent gets a structured result with payment options instead of an error. So the **control flow** is: “if 402, then decide and pay; else use the result.”
- **Payment details are machine-readable.**  
  `accepts` is an array of options with price, token, network, destination. The agent (or the app) can:
  - Check balance (SDK can do `payFirst()` to pick first affordable option).
  - Compare options (e.g. different chains/tokens).
  - Enforce policy (e.g. “never pay more than X” or “only Base”).
- **The agent makes a choice.**  
  The payment details (accepts, resource, error) are passed to the agent (e.g. as context for an LLM or decision step). The agent returns a choice: e.g. `{ pay: true, acceptIndex: 0 }` or `{ pay: false, reason: '...' }`. The app then calls `pay(acceptIndex)` or skips. No policy in app code—the agent decides based on the dumped info.
- **Pay and retry in one step.**  
  Once the agent has chosen, `pay()` or `payFirst()` builds the signed payment and retries the **same** request. The agent doesn’t manage headers or retry logic; it just gets back the success response (or throws if the server still rejects).
- **Same pattern for HTTP and A2A.**  
  For both `sdk.request()` and A2A (`messageA2A`, `loadTask`), 402 returns `x402Required` and `x402Payment`. So one mental model: “any call might be 402; if so, inspect accepts, **choose** (pay or skip, and which option), then pay and continue.”

---

## Summary table

| Capability | What the agent does | 402 handling |
|------------|---------------------|--------------|
| **HTTP API call** | `sdk.request({ url, method })` | Result is `{ x402Required, x402Payment }`; agent inspects `accepts`, then `pay()` / `payFirst()` to get resource. |
| **Message another agent** | `client.messageA2A(content)` | Same: 402 → `x402Payment` → decide → `pay()` → get message/task. |
| **Load a task** | `client.loadTask(taskId)` | Same: 402 → pay → get `AgentTask`. |
| **List tasks** | `client.listTasks()` | Optional payment; if 402, same pattern. |

---

## Quick reference (SDK surface)

- **x402:** `sdk.request()`, `sdk.fetchWithX402()`; on 402: `result.x402Payment.accepts`, `result.x402Payment.pay(index?)`, `result.x402Payment.payFirst()`.
- **A2A:** `sdk.loadAgent(id)`, `sdk.createA2AClient(agentOrSummary)`; then `client.messageA2A()`, `client.listTasks()`, `client.loadTask(taskId)`; task: `.query()`, `.message()`, `.cancel()`.
- **Both:** 402 returns `x402Required: true` and `x402Payment`; payment options in `x402Payment.accepts`; pay and retry via `pay()` or `payFirst()`.

This PR adds the above so agents can call paid APIs and paid A2A endpoints in a single, decision-friendly flow.
