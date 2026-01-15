import {
  getAddress,
  hexToBytes,
  type Hex,
  recoverMessageAddress,
  recoverTypedDataAddress,
} from 'viem';

/**
 * Normalize ECDSA signatures to use v = 27/28 (some contracts/libraries expect this).
 *
 * Some signers return v in {0,1}. This function converts those to {27,28}.
 */
export function normalizeEcdsaSignature(signature: Hex): Hex {
  const bytes = hexToBytes(signature);
  if (bytes.length !== 65) return signature;
  const v = bytes[64];
  if (v === 0 || v === 1) {
    bytes[64] = v + 27;
    // Avoid Node-only Buffer usage; build hex string manually.
    let hex = '0x';
    for (const b of bytes) {
      hex += b.toString(16).padStart(2, '0');
    }
    return hex as Hex;
  }
  return signature;
}

export async function recoverMessageSigner(args: { message: string | Uint8Array; signature: Hex }): Promise<`0x${string}`> {
  const address = await recoverMessageAddress({
    message: typeof args.message === 'string' ? args.message : { raw: args.message },
    signature: args.signature,
  });
  return getAddress(address);
}

export async function recoverTypedDataSigner(args: {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
  signature: Hex;
}): Promise<`0x${string}`> {
  const address = await recoverTypedDataAddress({
    domain: args.domain as any,
    types: args.types as any,
    primaryType: args.primaryType as any,
    message: args.message as any,
    signature: args.signature,
  });
  return getAddress(address);
}

