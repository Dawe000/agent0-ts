/**
 * MCP x402 demo:
 * - Creates an MCP client from AgentSummary
 * - Calls a tool
 * - If 402, pays and retries via x402Payment.pay()
 */
import { SDK, type AgentSummary } from '../src/index.js';

async function main() {
  const mcpEndpoint = process.env.MCP_ENDPOINT || 'http://localhost:4040/mcp';
  const chainId = Number(process.env.CHAIN_ID || 84532);
  const rpcUrl = process.env.RPC_URL || 'https://base-sepolia.drpc.org';
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('PRIVATE_KEY is required for x402 pay flow');
  }

  const sdk = new SDK({ chainId, rpcUrl, privateKey });
  const summary: AgentSummary = {
    chainId,
    agentId: `${chainId}:0`,
    name: 'MCP Demo Agent',
    description: 'MCP x402 demo',
    mcp: mcpEndpoint,
    owners: [],
    operators: [],
    supportedTrusts: [],
    a2aSkills: [],
    mcpTools: [],
    mcpPrompts: [],
    mcpResources: [],
    oasfSkills: [],
    oasfDomains: [],
    active: true,
    x402support: false,
    extras: {},
  };

  const client = sdk.createMCPClient(summary);
  const result = await client.call('get_weather', { location: 'London', unit: 'celsius' });

  if ('x402Required' in result && result.x402Required) {
    console.log('402 payment required. Accepts:', result.x402Payment.accepts);
    const paid = await result.x402Payment.pay();
    console.log('Paid response:', paid);
    return;
  }

  console.log('Tool response:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

