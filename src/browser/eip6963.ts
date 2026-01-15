/**
 * ERC-6963: Multi Injected Provider Discovery
 *
 * This module is framework-agnostic and SSR-safe (it does not touch `window` at import time).
 *
 * References:
 * - ERC-6963: https://eips.ethereum.org/EIPS/eip-6963
 */

export type EIP1193RequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type EIP1193Provider = {
  request(args: EIP1193RequestArgs): Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};

export type EIP6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string; // data URI
  rdns: string;
};

export type EIP6963ProviderDetail = {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
};

const ANNOUNCE_EVENT = 'eip6963:announceProvider';
const REQUEST_EVENT = 'eip6963:requestProvider';

function getWindow(): Window | undefined {
  // SSR-safe access
  const g = globalThis as any;
  return typeof g?.window !== 'undefined' ? (g.window as Window) : undefined;
}

function isEip1193Provider(x: unknown): x is EIP1193Provider {
  return Boolean(x && typeof x === 'object' && typeof (x as any).request === 'function');
}

function normalizeProviderInfo(info: EIP6963ProviderInfo): EIP6963ProviderInfo {
  // Defensive normalization: keep required fields as strings.
  return {
    uuid: String(info.uuid),
    name: String(info.name),
    icon: String(info.icon),
    rdns: String(info.rdns),
  };
}

/**
 * Listen for providers announced via ERC-6963.
 * Returns an unsubscribe function.
 */
export function onEip6963Announce(handler: (detail: EIP6963ProviderDetail) => void): () => void {
  const w = getWindow();
  if (!w?.addEventListener) {
    return () => {};
  }

  const listener = (event: Event) => {
    const ce = event as CustomEvent<EIP6963ProviderDetail>;
    const detail = ce?.detail;
    if (!detail || !detail.info || !isEip1193Provider(detail.provider)) return;
    handler({ info: normalizeProviderInfo(detail.info), provider: detail.provider });
  };

  w.addEventListener(ANNOUNCE_EVENT, listener as EventListener);
  return () => w.removeEventListener(ANNOUNCE_EVENT, listener as EventListener);
}

export type DiscoverProvidersOptions = {
  /**
   * How long to wait for providers to announce themselves after requesting.
   * Defaults to 250ms.
   */
  timeoutMs?: number;
};

/**
 * Discover injected wallet providers via ERC-6963.
 *
 * In browsers, this dispatches `eip6963:requestProvider` and waits for `eip6963:announceProvider` events.
 * In SSR/Node, it returns an empty list.
 */
export async function discoverEip6963Providers(
  options: DiscoverProvidersOptions = {}
): Promise<EIP6963ProviderDetail[]> {
  const w = getWindow();
  if (!w?.dispatchEvent || !w?.addEventListener) {
    return [];
  }

  const timeoutMs = options.timeoutMs ?? 250;
  const byUuid = new Map<string, EIP6963ProviderDetail>();

  const unsubscribe = onEip6963Announce((detail) => {
    // Deduplicate by uuid (per spec).
    byUuid.set(detail.info.uuid, detail);
  });

  try {
    // Trigger providers to announce.
    w.dispatchEvent(new Event(REQUEST_EVENT));

    // Wait a short window for announcements.
    await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    return Array.from(byUuid.values());
  } finally {
    unsubscribe();
  }
}

export type ConnectOptions = {
  /**
   * If true (default), calls `eth_requestAccounts` to prompt the user.
   * If false, calls `eth_accounts` (no prompt) and returns empty if not already connected.
   */
  requestAccounts?: boolean;
};

/**
 * Connect to a selected EIP-1193 provider and return the first account (if any).
 */
export async function connectEip1193(
  provider: EIP1193Provider,
  options: ConnectOptions = {}
): Promise<{ account?: string }> {
  const requestAccounts = options.requestAccounts ?? true;
  const method = requestAccounts ? 'eth_requestAccounts' : 'eth_accounts';
  const accounts = (await provider.request({ method })) as unknown;

  if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
    return { account: accounts[0] };
  }
  return { account: undefined };
}

