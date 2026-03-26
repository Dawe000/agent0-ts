/** `npx tsx examples/mcp-demo.ts` — Delx MCP via `loadAgent` */
import './_env';
import { SDK } from '../src/index';
import type { AgentId } from '../src/models/types.js';

const DELX_AGENT_ID = '8453:28350' as AgentId;

async function main() {
  const sdk = new SDK({
    chainId: 8453,
    rpcUrl: process.env.DELX_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org',
  });
  const agent = await sdk.loadAgent(DELX_AGENT_ID);
  const out = await agent.mcp.call('get_affirmation', {});
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
