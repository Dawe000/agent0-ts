import type { Address } from '../models/types.js';

export type TransactionOptions = {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

export type Hex = `0x${string}`;

export type ChainLog = {
  address: Address;
  data: Hex;
  topics: Hex[];
  blockNumber?: bigint;
  transactionHash?: Hex;
  logIndex?: number;
};

export type ChainReceipt = {
  transactionHash: Hex;
  blockNumber: bigint;
  status: 'success' | 'reverted';
  logs: ChainLog[];
};

/**
 * Minimal EIP-1193 provider shape (wallet/injected provider).
 */
export type EIP1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
};

/**
 * Internal on-chain abstraction used across the SDK.
 *
 * This deliberately avoids leaking web3 library types (viem) into most of the codebase.
 */
export interface ChainClient {
  /**
   * Configured chain id for this SDK instance.
   */
  readonly chainId: number;

  /**
   * RPC URL used for reads.
   */
  readonly rpcUrl: string;

  /**
   * Returns the active account address (if available) without prompting the user.
   */
  getAddress(): Promise<Address | undefined>;

  /**
   * Ensures an active account exists; may prompt via wallet provider if configured.
   */
  ensureAddress(): Promise<Address>;

  /**
   * Read-only contract call.
   */
  readContract<T = unknown>(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<T>;

  /**
   * Write contract call (sends a transaction).
   * Returns transaction hash.
   */
  writeContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    options?: TransactionOptions;
  }): Promise<`0x${string}`>;

  /**
   * Send a raw transaction to a contract (pre-encoded data).
   * Returns transaction hash.
   */
  sendTransaction(args: {
    to: Address;
    data: `0x${string}`;
    options?: TransactionOptions;
  }): Promise<`0x${string}`>;

  /**
   * Wait for a transaction to be mined.
   */
  waitForTransaction(args: { hash: Hex; timeoutMs?: number }): Promise<ChainReceipt>;

  /**
   * Fetch logs from the public RPC.
   */
  getEventLogs(args: {
    address: Address;
    abi: readonly unknown[];
    eventName: string;
    /**
     * Event args filter (supports indexed args). Leave undefined to fetch all.
     */
    eventArgs?: Record<string, unknown>;
    fromBlock?: bigint;
    toBlock?: bigint;
  }): Promise<ChainLog[]>;

  /**
   * Chain helpers.
   */
  getBlockNumber(): Promise<bigint>;
  getBlockTimestamp(blockTag?: 'latest'): Promise<bigint>;

  /**
   * Crypto helpers (used throughout the SDK for hashes/signature validation).
   */
  keccak256Utf8(message: string): `0x${string}`;
  isAddress(address: string): boolean;
  toChecksumAddress(address: string): Address;

  /**
   * Signing helpers (available only when a signer is configured).
   */
  signMessage(message: string | Uint8Array): Promise<`0x${string}`>;
  signTypedData(args: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
}

