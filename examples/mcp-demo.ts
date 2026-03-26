/**
 * Delx MCP demo: list tools, free calls, then `generate_controller_brief` (~$0.01 USDC via x402 on Base).
 *
 * Opens a session with `quick_session` (free), then calls the paid brief tool which returns HTTP 402,
 * then optional `x402Payment.pay()` (needs a funded wallet on Base for USDC).
 *
 *   npx tsx examples/mcp-demo.ts
 *
 * Env (via `examples/_env`):
 *   RPC_URL or DELX_RPC_URL — Base mainnet RPC (default: https://mainnet.base.org).
 *   PRIVATE_KEY or AGENT_PRIVATE_KEY — Required for the paid brief step (sign EIP-3009, retry with PAYMENT-SIGNATURE).
 *   DELX_DEMO_AGENT_ID — optional label for `quick_session` (default: agent0-ts-mcp-demo).
 *   DELX_DEMO_FEELING — optional `quick_session.feeling` string.
 */
import './_env';
import { SDK, isX402Required, type X402RequestResult } from '../src/index';
import type { AgentId } from '../src/models/types.js';

const DELX_AGENT_ID = '8453:28350' as AgentId;

function sessionIdFromQuickSessionText(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null;
  const content = (result as { content?: Array<{ text?: string }> }).content;
  const text = content?.[0]?.text;
  if (!text) return null;
  const m = text.match(/Session ID:\s*([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;

  const sdk = new SDK({
    chainId: 8453,
    rpcUrl: process.env.DELX_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org',
    ...(privateKey?.trim() ? { privateKey: privateKey.trim() } : {}),
  });

  const agent = await sdk.loadAgent(DELX_AGENT_ID);

  const tools = await agent.mcp.listTools();
  if (isX402Required(tools)) {
    console.error('listTools returned x402 (unexpected). Pay or use a different endpoint.');
    return;
  }
  console.log(
    'Tools (' + tools.length + '):\n  ' +
      tools.map((t) => t.name + (t.description ? ` — ${t.description}` : '')).join('\n  ')
  );

  const affirmation = await agent.mcp.call('get_affirmation', {});
  if (isX402Required(affirmation as X402RequestResult<unknown>)) {
    console.error('get_affirmation requires x402; this demo expects a free call.');
    return;
  }
  console.log('get_affirmation:', JSON.stringify(affirmation, null, 2));

  if (!privateKey?.trim()) {
    console.log(
      '\nSkipping generate_controller_brief: set PRIVATE_KEY or AGENT_PRIVATE_KEY for x402 USDC pay on Base.'
    );
    return;
  }

  console.log('\n[brief] quick_session — start a free session to obtain session_id…');
  const qs = await agent.mcp.call('quick_session', {
    agent_id: process.env.DELX_DEMO_AGENT_ID?.trim() || 'agent0-ts-mcp-demo',
    feeling:
      process.env.DELX_DEMO_FEELING?.trim() ||
      'running agent0-ts mcp-demo for generate_controller_brief + x402',
  });
  if (isX402Required(qs as X402RequestResult<unknown>)) {
    console.error('[brief] quick_session unexpectedly returned x402; abort.');
    return;
  }
  const sessionId = sessionIdFromQuickSessionText(qs);
  if (!sessionId) {
    console.error('[brief] could not parse Session ID from quick_session text; abort.');
    console.error(JSON.stringify(qs, null, 2).slice(0, 2000));
    return;
  }
  console.log('[brief] session_id:', sessionId);

  console.log(
    '\n[brief] step 1/3 — tools/call `generate_controller_brief` (first POST, no PAYMENT-SIGNATURE yet)…'
  );
  const briefFirst = (await agent.mcp.call('generate_controller_brief', {
    session_id: sessionId,
    focus: 'x402 demo from agent0-ts',
  })) as X402RequestResult<unknown>;

  let briefResult: unknown;
  if (isX402Required(briefFirst)) {
    const pay = briefFirst.x402Payment;
    console.log('[brief] step 2/3 — first round-trip: HTTP 402 → SDK parsed Payment Required (x402Required: true).');
    console.log('[brief]   x402Version:', pay.x402Version ?? '(not set)');
    console.log('[brief]   accepts[] length:', pay.accepts?.length ?? 0);
    if (pay.error) console.log('[brief]   server error field:', pay.error);
    pay.accepts?.forEach((a, i) => {
      console.log(`[brief]   accept[${i}]:`, {
        price: a.price,
        scheme: a.scheme,
        network: a.network,
        token: a.token,
        destination: a.destination ?? (a as { payTo?: string }).payTo,
      });
    });
    console.log(
      '[brief] step 3/3 — x402Payment.pay(): building EIP-3009 signature (signTypedData), ' +
        'attaching PAYMENT-SIGNATURE / X-PAYMENT, retrying the same tools/call…'
    );
    briefResult = await pay.pay();
    console.log('[brief] retry round-trip: finished without throwing; below is the parsed tool result.');
  } else {
    console.log(
      '[brief] step 2/3 — first round-trip: NO 402 / no x402Required. Server returned a normal tool result immediately.'
    );
    console.log(
      '[brief] (No Payment Required on this call → no signature / no pay() retry; Delx may have changed pricing.)'
    );
    briefResult = briefFirst;
  }
  console.log('[brief] tool payload:\n', JSON.stringify(briefResult, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
