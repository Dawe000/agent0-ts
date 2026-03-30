# MCP via a loaded agent

Use **`await sdk.loadAgent(agentId)`** to get an **`Agent`** whose registration file includes an MCP HTTPS URL. **`agent.mcp`** is a lazily built **`MCPHandle`** (JSON-RPC over HTTPS; JSON or SSE). It uses the same **`SDK`** wallet/RPC config as the rest of the SDK, so **x402** `pay()` works on that handle.

For a **real** server and env setup, see **`examples/mcp-demo.ts`**.

---

## Example (illustrative)

```ts
import type { AgentId, MCPTool, X402RequestResult } from 'agent0-sdk';

const agent = await sdk.loadAgent('8453:12345' as AgentId);

const tools = (await agent.mcp.listTools()) as MCPTool[];

const quote = (await agent.mcp.getStockPrice({ symbol: 'AAPL' })) as X402RequestResult<unknown>;

if (quote.x402Required) {
  const pay = quote.x402Payment;
  console.log('x402 accepts:', JSON.stringify(pay.accepts, null, 2));
  const paid = await pay.pay();
  console.log(paid);
} else {
  console.log(quote);
}
```

---

## Notes

- **`listTools()`**, **`call()`**, **`prompts`**, **`resources`** can all surface **`x402Required`**; narrow with **`if (result.x402Required)`** (or **`'x402Required' in result && result.x402Required`**).
- **`privateKey`** / **`walletProvider`** on **`SDK`** is required for **`pay()`** to sign; without it, free tools may still work.
- Dynamic **`agent.mcp.someTool(args)`** only works when **`someTool`** is a safe JS identifier and matches the server’s tool name—equivalent to **`agent.mcp.call('someTool', args)`**. Arguments are the MCP tool’s **input object** (e.g. **`{ symbol: 'AAPL' }`**), not positional parameters.

---

## See also

- **`examples/mcp-demo.ts`**
- **`tests/mcp-integration.test.ts`**
- Types: **`MCPHandle`**, **`MCPTool`**, **`X402RequestResult`** (`agent0-sdk`)
