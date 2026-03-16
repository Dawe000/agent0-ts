/**
 * x402 payment-required types and 402 response parsing.
 */

/**
 * A single payment option from a 402 response (PAYMENT-REQUIRED header).
 * Each entry has at least price and token; optional fields for network, scheme, etc.
 */
export interface X402Accept {
  /** Amount in smallest units (e.g. USDC 6 decimals). May be string for large values. */
  price: string;
  /** Token contract address or symbol. */
  token: string;
  /** Chain id (number or string e.g. "base-sepolia", "eip155:84532"). */
  network?: string;
  scheme?: string;
  description?: string;
  /** Max amount required when variable. */
  maxAmountRequired?: string;
  /** Destination / pay-to address (recipient or verifying contract). */
  destination?: string;
  /** Asset address (alias for token in some 402 body shapes). */
  asset?: string;
  /** Additional fields from server (e.g. payTo, paymentRequirements). */
  [key: string]: unknown;
}

/**
 * Payment-required payload returned when the server responds with HTTP 402.
 * Always includes accepts[]; when there is a single accept, convenience fields may be set.
 */
export interface X402Payment<T = unknown> {
  /** Array of accepted payment options. Always present. */
  accepts: X402Accept[];
  /** x402 version from server's PAYMENT-REQUIRED header (e.g. 1 or 2). */
  x402Version?: number;
  /** V1/V2 human-readable error message from 402 response when present. */
  error?: string;
  /** V2 ResourceInfo from 402 response when present. */
  resource?: ResourceInfo;
  /** When single accept: convenience price (same as accepts[0].price). */
  price?: string;
  /** When single accept: convenience token (same as accepts[0].token). */
  token?: string;
  /** When single accept: convenience network (same as accepts[0].network). */
  network?: string;
  /**
   * Performs payment and retries the request.
   * No arg = use single accept; number = accepts[index]; X402Accept = chosen option.
   * Resolves to the same shape as a successful request (no x402Required).
   */
  pay(accept?: X402Accept | number): Promise<T>;
  /**
   * When present (deps provided checkBalance): pays using the first accept for which
   * the signer has sufficient token balance on that chain. Throws if none have sufficient balance.
   */
  payFirst?(): Promise<T>;
}

/**
 * Options for the generic x402 HTTP request.
 */
export interface X402RequestOptions<T = unknown> {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array;
  /**
   * Optional parser for 2xx response body. If omitted, the body is parsed as JSON (res.json()).
   */
  parseResponse?: (response: Response) => Promise<T>;
  /**
   * Optional payment to send with the first request (e.g. base64 PAYMENT-SIGNATURE payload).
   * If provided and server returns 2xx, one round trip; if 402, normal x402 flow.
   */
  payment?: string;
}

/**
 * Response when server returns HTTP 402. Caller checks x402Required and may call x402Payment.pay().
 */
export interface X402RequiredResponse<T> {
  x402Required: true;
  x402Payment: X402Payment<T>;
}

/**
 * Result of sdk.request(): either the parsed success value or the 402 response object.
 * Success branch is typed with x402Required?: false so you can always read result.x402Required
 * (undefined/false on success, true on 402) and use if (result.x402Required) to narrow.
 */
export type X402RequestResult<T> = (T & { x402Required?: false }) | X402RequiredResponse<T>;

/**
 * Type guard: result is 402 response. Returns false for null/undefined.
 */
export function isX402Required<T>(
  result: X402RequestResult<T> | null | undefined
): result is X402RequiredResponse<T> {
  return typeof result === 'object' && result !== null && 'x402Required' in result && (result as X402RequiredResponse<T>).x402Required === true;
}

/** EVM chain names/slugs: x402 spec V1 names (docs.x402.org network-and-token-support) + common slugs agents may send. */
const EVM_NETWORK_SLUGS = new Set([
  'base', 'base-sepolia', 'base-mainnet', 'base-goerli',
  'ethereum', 'ethereum-mainnet', 'ethereum-sepolia', 'mainnet', 'sepolia', 'goerli', 'holesky',
  'polygon', 'polygon-amoy', 'matic',
  'arbitrum', 'arbitrum-one', 'arbitrum-sepolia',
  'optimism', 'optimism-mainnet', 'optimism-sepolia',
  'avalanche', 'avalanche-fuji', 'fuji', 'bnb', 'bnb-chain', 'bsc', 'bsc-testnet',
  'linea', 'linea-sepolia', 'zksync', 'zksync-sepolia',
  'iotex', 'iotex-testnet',
  'sei', 'sei-testnet', 'skale-base', 'skale-base-sepolia',
]);

/** True if the accept is EVM (eip155:* or numeric network or known EVM slug). Used to filter out Solana etc. */
function isEvmAccept(a: X402Accept): boolean {
  const n = a.network;
  if (n == null || n === '') return true;
  const s = String(n).toLowerCase();
  if (/^eip155:\d+$/.test(s) || /^\d+$/.test(s)) return true;
  return EVM_NETWORK_SLUGS.has(s);
}

/** Filter accepts to EVM-only (Solana and other non-EVM options removed). Applied when building 402 response. */
export function filterEvmAccepts(accepts: X402Accept[]): X402Accept[] {
  return accepts.filter(isEvmAccept);
}

/**
 * Normalize a single accept entry from PAYMENT-REQUIRED header (amount/asset/payTo → price/token/destination).
 */
function normalizeAcceptEntry(entry: Record<string, unknown>): X402Accept {
  const pr = (entry.paymentRequirements as Record<string, unknown> | undefined) || entry;
  const price =
    (pr.price as string) ?? (pr.amount as string) ?? (pr.maxAmountRequired as string) ?? '0';
  const token = (pr.token as string) ?? (pr.asset as string) ?? '';
  return {
    price: String(price),
    token: String(token),
    network: pr.network as string | undefined,
    scheme: pr.scheme as string | undefined,
    description: pr.description as string | undefined,
    maxAmountRequired: pr.maxAmountRequired as string | undefined,
    destination: (pr.destination as string) ?? (pr.payTo as string),
    asset: pr.asset as string | undefined,
    ...entry,
  };
}

function decodeBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  return atob(b64);
}

function parseResourceInfo(obj: unknown): ResourceInfo | undefined {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const r = obj as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : undefined;
  if (url === undefined) return undefined;
  return {
    url,
    description: typeof r.description === 'string' ? r.description : undefined,
    mimeType: typeof r.mimeType === 'string' ? r.mimeType : undefined,
  };
}

/**
 * Result of parsing PAYMENT-REQUIRED header (accepts + optional version, resource, error).
 */
export interface Parse402FromHeaderResult {
  accepts: X402Accept[];
  x402Version?: number;
  /** V2 PaymentRequired top-level resource (ResourceInfo). Present when server sends it. */
  resource?: ResourceInfo;
  /** V1 PaymentRequirementsResponse human-readable error message. Present when server sends it. */
  error?: string;
}

/** V2 ResourceInfo: url, optional description and mimeType (x402 spec §5.1). */
export interface ResourceInfo {
  url?: string;
  description?: string;
  mimeType?: string;
}

/** Settlement response (SettlementResponse / SettleResponse) from PAYMENT-RESPONSE header or body after successful pay. */
export interface X402SettlementResponse {
  success: boolean;
  errorReason?: string;
  transaction?: string;
  network?: string;
  payer?: string;
}

/**
 * Parse PAYMENT-REQUIRED header (x402 spec: base64-encoded JSON with accepts array).
 * Returns accepts, x402Version, and when present resource (v2) and error (v1).
 */
export function parse402FromHeader(headerValue: string | null): Parse402FromHeaderResult {
  if (!headerValue || typeof headerValue !== 'string') return { accepts: [] };
  try {
    const json = JSON.parse(decodeBase64(headerValue.trim())) as Record<string, unknown>;
    if (json == null || typeof json !== 'object') return { accepts: [] };
    const list = json.accepts;
    const accepts = Array.isArray(list)
      ? list
          .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
          .map(normalizeAcceptEntry)
      : [];
    const x402Version = typeof json.x402Version === 'number' ? json.x402Version : undefined;
    const resource = parseResourceInfo(json.resource);
    const error = typeof json.error === 'string' ? json.error : undefined;
    return { accepts, x402Version, resource, error };
  } catch {
    return { accepts: [] };
  }
}

/**
 * Parse WWW-Authenticate header with x402 challenge (e.g. 402payment-test.com).
 * Format: x402 address="0x...", amount="0.01", chainId="8453", token="0x..."
 * Returns a single accept; amount is converted to atomic units if it looks like a decimal (USDC 6 decimals).
 */
export function parse402FromWWWAuthenticate(headerValue: string | null): Parse402FromHeaderResult {
  if (!headerValue || typeof headerValue !== 'string') return { accepts: [] };
  const x402Match = headerValue.match(/\bx402\s+(.+)/i);
  if (!x402Match) return { accepts: [] };
  const rest = x402Match[1]!;
  const pairs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*([^\s,]+|"[^"]*")/g;
  let m;
  while ((m = re.exec(rest)) !== null) {
    const key = m[1]!.toLowerCase();
    let val = m[2]!;
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    pairs[key] = val;
  }
  const address = pairs.address ?? pairs.payto;
  const amount = pairs.amount ?? '0';
  const chainId = pairs.chainid ?? pairs.chain_id ?? '';
  const token = pairs.token ?? pairs.asset ?? '';
  if (!address || !token) return { accepts: [] };
  // If amount looks like decimal (e.g. "0.01"), assume USDC 6 decimals for atomic units
  let price = amount;
  if (/^\d*\.\d+$/.test(amount)) {
    const n = parseFloat(amount);
    if (Number.isFinite(n)) price = String(Math.round(n * 1e6));
  }
  // x402 v1 uses chain names (e.g. "base-sepolia"); v2 uses CAIP-2 (eip155:chainId). Prefer explicit network.
  const rawNetwork = pairs.network ?? chainId;
  const networkStr = !rawNetwork
    ? undefined
    : /^eip155:\d+$/.test(rawNetwork)
      ? rawNetwork
      : /^\d+$/.test(rawNetwork.trim())
        ? `eip155:${rawNetwork}`
        : rawNetwork; // chain name as-is for v1
  const accept: X402Accept = {
    price,
    token,
    destination: address,
    payTo: address,
    network: networkStr,
    scheme: 'exact',
  };
  // Servers that advertise chainId (e.g. 402payment-test.com) often expect v2 (PAYMENT-SIGNATURE + CAIP-2).
  const x402Version = networkStr && /^eip155:\d+$/.test(networkStr) ? 2 : 1;
  return { accepts: [accept], x402Version };
}

/**
 * Parse 402 response body (JSON with accepts array). Used when server sends payment options in body (e.g. httpay.xyz).
 * Returns accepts, x402Version, and when present resource (v2) and error (v1).
 */
export function parse402FromBody(bodyText: string | null): Parse402FromHeaderResult {
  if (!bodyText || typeof bodyText !== 'string') return { accepts: [] };
  try {
    const json = JSON.parse(bodyText.trim()) as Record<string, unknown>;
    if (json == null || typeof json !== 'object') return { accepts: [] };
    const list = json.accepts;
    const accepts = Array.isArray(list)
      ? list
          .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
          .map(normalizeAcceptEntry)
      : [];
    const x402Version = typeof json.x402Version === 'number' ? json.x402Version : undefined;
    const resource = parseResourceInfo(json.resource);
    const error = typeof json.error === 'string' ? json.error : undefined;
    return { accepts, x402Version, resource, error };
  } catch {
    return { accepts: [] };
  }
}

/**
 * Parse PAYMENT-REQUIRED header (x402 spec: base64-encoded JSON with accepts array).
 * Server sends payment options in header; body may be empty. Returns [] if header missing/invalid.
 */
export function parse402AcceptsFromHeader(headerValue: string | null): X402Accept[] {
  return parse402FromHeader(headerValue).accepts;
}

/**
 * Parse PAYMENT-RESPONSE header (base64-encoded JSON) after successful pay.
 * Returns settlement info (success, transaction, network, payer) when present and valid.
 */
export function parse402SettlementFromHeader(headerValue: string | null): X402SettlementResponse | undefined {
  if (!headerValue || typeof headerValue !== 'string') return undefined;
  try {
    const json = JSON.parse(decodeBase64(headerValue.trim())) as Record<string, unknown>;
    if (json == null || typeof json !== 'object') return undefined;
    return {
      success: json.success === true,
      errorReason: typeof json.errorReason === 'string' ? json.errorReason : undefined,
      transaction: typeof json.transaction === 'string' ? json.transaction : undefined,
      network: typeof json.network === 'string' ? json.network : undefined,
      payer: typeof json.payer === 'string' ? json.payer : undefined,
    };
  } catch {
    return undefined;
  }
}
