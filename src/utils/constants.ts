/**
 * Shared constants for Agent0 SDK
 */

/**
 * IPFS gateway URLs for fallback retrieval
 */
export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
] as const;

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  IPFS_GATEWAY: 10000, // 10 seconds
  PINATA_UPLOAD: 80000, // 80 seconds
  TRANSACTION_WAIT: 45000, // 45 seconds
  ENDPOINT_CRAWLER_DEFAULT: 5000, // 5 seconds
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  FEEDBACK_EXPIRY_HOURS: 24,
  SEARCH_PAGE_SIZE: 50,
} as const;

