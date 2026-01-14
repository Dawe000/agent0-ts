/**
 * Agent class for managing individual agents
 */

import { ethers } from 'ethers';
import type {
  RegistrationFile,
  Endpoint,
} from '../models/interfaces.js';
import type { AgentId, Address, URI } from '../models/types.js';
import { EndpointType, TrustModel } from '../models/enums.js';
import type { SDK } from './sdk.js';
import { EndpointCrawler } from './endpoint-crawler.js';
import { parseAgentId } from '../utils/id-format.js';
import { TIMEOUTS } from '../utils/constants.js';
import { validateSkill, validateDomain } from './oasf-validator.js';

/**
 * Agent class for managing individual agents
 */
export class Agent {
  private registrationFile: RegistrationFile;
  private _endpointCrawler: EndpointCrawler;
  private _dirtyMetadata = new Set<string>();
  private _lastRegisteredWallet?: Address;
  private _lastRegisteredEns?: string;

  constructor(private sdk: SDK, registrationFile: RegistrationFile) {
    this.registrationFile = registrationFile;
    this._endpointCrawler = new EndpointCrawler(5000);
  }

  // Read-only properties
  get agentId(): AgentId | undefined {
    return this.registrationFile.agentId;
  }

  get agentURI(): URI | undefined {
    return this.registrationFile.agentURI;
  }

  get name(): string {
    return this.registrationFile.name;
  }

  get description(): string {
    return this.registrationFile.description;
  }

  get image(): URI | undefined {
    return this.registrationFile.image;
  }

  get mcpEndpoint(): string | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.MCP);
    return ep?.value;
  }

  get a2aEndpoint(): string | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.A2A);
    return ep?.value;
  }

  get ensEndpoint(): string | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.ENS);
    return ep?.value;
  }

  get walletAddress(): Address | undefined {
    return this.registrationFile.walletAddress;
  }

  get mcpTools(): string[] | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.MCP);
    return ep?.meta?.mcpTools;
  }

  get mcpPrompts(): string[] | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.MCP);
    return ep?.meta?.mcpPrompts;
  }

  get mcpResources(): string[] | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.MCP);
    return ep?.meta?.mcpResources;
  }

  get a2aSkills(): string[] | undefined {
    const ep = this.registrationFile.endpoints.find((e) => e.type === EndpointType.A2A);
    return ep?.meta?.a2aSkills;
  }

  // Endpoint management
  async setMCP(endpoint: string, version: string = '2025-06-18', autoFetch: boolean = true): Promise<this> {
    // Remove existing MCP endpoint if any
    this.registrationFile.endpoints = this.registrationFile.endpoints.filter(
      (ep) => ep.type !== EndpointType.MCP
    );

    // Try to fetch capabilities from the endpoint (soft fail)
    const meta: Record<string, unknown> = { version };
    if (autoFetch) {
      try {
        const capabilities = await this._endpointCrawler.fetchMcpCapabilities(endpoint);
        if (capabilities) {
          if (capabilities.mcpTools) meta.mcpTools = capabilities.mcpTools;
          if (capabilities.mcpPrompts) meta.mcpPrompts = capabilities.mcpPrompts;
          if (capabilities.mcpResources) meta.mcpResources = capabilities.mcpResources;
        }
      } catch (error) {
        // Soft fail - continue without capabilities
      }
    }

    // Add new MCP endpoint
    const mcpEndpoint: Endpoint = {
      type: EndpointType.MCP,
      value: endpoint,
      meta,
    };
    this.registrationFile.endpoints.push(mcpEndpoint);
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);

    return this;
  }

  async setA2A(agentcard: string, version: string = '0.30', autoFetch: boolean = true): Promise<this> {
    // Remove existing A2A endpoint if any
    this.registrationFile.endpoints = this.registrationFile.endpoints.filter(
      (ep) => ep.type !== EndpointType.A2A
    );

    // Try to fetch capabilities from the endpoint (soft fail)
    const meta: Record<string, unknown> = { version };
    if (autoFetch) {
      try {
        const capabilities = await this._endpointCrawler.fetchA2aCapabilities(agentcard);
        if (capabilities?.a2aSkills) {
          meta.a2aSkills = capabilities.a2aSkills;
        }
      } catch (error) {
        // Soft fail - continue without capabilities
      }
    }

    // Add new A2A endpoint
    const a2aEndpoint: Endpoint = {
      type: EndpointType.A2A,
      value: agentcard,
      meta,
    };
    this.registrationFile.endpoints.push(a2aEndpoint);
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);

    return this;
  }

  setENS(name: string, version: string = '1.0'): this {
    // Remove existing ENS endpoints
    this.registrationFile.endpoints = this.registrationFile.endpoints.filter(
      (ep) => ep.type !== EndpointType.ENS
    );

    // Check if ENS changed
    if (name !== this._lastRegisteredEns) {
      this._dirtyMetadata.add('agentName');
    }

    // Add new ENS endpoint
    const ensEndpoint: Endpoint = {
      type: EndpointType.ENS,
      value: name,
      meta: { version },
    };
    this.registrationFile.endpoints.push(ensEndpoint);
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);

    return this;
  }

  /**
   * Remove endpoint(s) with wildcard semantics (parity with Python SDK).
   *
   * - If no args are provided, removes all endpoints.
   * - If only `type` is provided, removes all endpoints of that type.
   * - If only `value` is provided, removes all endpoints with that value.
   * - If both are provided, removes endpoints that match both.
   */
  removeEndpoint(): this;
  removeEndpoint(opts: { type?: EndpointType; value?: string }): this;
  removeEndpoint(type?: EndpointType, value?: string): this;
  removeEndpoint(
    arg1?: EndpointType | { type?: EndpointType; value?: string },
    arg2?: string
  ): this {
    const { type, value } =
      arg1 && typeof arg1 === 'object'
        ? { type: arg1.type, value: arg1.value }
        : { type: arg1 as EndpointType | undefined, value: arg2 };

    if (type === undefined && value === undefined) {
      // Remove all endpoints
      this.registrationFile.endpoints = [];
    } else {
      // Remove matching endpoints (wildcard semantics)
      this.registrationFile.endpoints = this.registrationFile.endpoints.filter((ep) => {
        const typeMatches = type === undefined || ep.type === type;
        const valueMatches = value === undefined || ep.value === value;
        return !(typeMatches && valueMatches);
      });
    }

    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  /**
   * Remove all endpoints.
   */
  removeEndpoints(): this {
    return this.removeEndpoint();
  }

  // OASF endpoint management
  private _getOrCreateOasfEndpoint(): Endpoint {
    // Find existing OASF endpoint
    const existing = this.registrationFile.endpoints.find(
      (ep) => ep.type === EndpointType.OASF
    );
    if (existing) {
      return existing;
    }

    // Create new OASF endpoint with default values
    const oasfEndpoint: Endpoint = {
      type: EndpointType.OASF,
      value: 'https://github.com/agntcy/oasf/',
      meta: { version: 'v0.8.0', skills: [], domains: [] },
    };
    this.registrationFile.endpoints.push(oasfEndpoint);
    return oasfEndpoint;
  }

  addSkill(slug: string, validateOASF: boolean = false): this {
    /**
     * Add a skill to the OASF endpoint.
     * @param slug The skill slug to add (e.g., "natural_language_processing/summarization")
     * @param validateOASF If true, validate the slug against the OASF taxonomy (default: false)
     * @returns this for method chaining
     * @throws Error if validateOASF=true and the slug is not valid
     */
    if (validateOASF) {
      if (!validateSkill(slug)) {
        throw new Error(
          `Invalid OASF skill slug: ${slug}. ` +
            'Use validateOASF=false to skip validation.'
        );
      }
    }

    const oasfEndpoint = this._getOrCreateOasfEndpoint();

    // Initialize skills array if missing
    if (!oasfEndpoint.meta) {
      oasfEndpoint.meta = {};
    }
    if (!Array.isArray(oasfEndpoint.meta.skills)) {
      oasfEndpoint.meta.skills = [];
    }

    // Add slug if not already present (avoid duplicates)
    const skills = oasfEndpoint.meta.skills as string[];
    if (!skills.includes(slug)) {
      skills.push(slug);
    }

    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  removeSkill(slug: string): this {
    /**
     * Remove a skill from the OASF endpoint.
     * @param slug The skill slug to remove
     * @returns this for method chaining
     */
    // Find OASF endpoint
    const oasfEndpoint = this.registrationFile.endpoints.find(
      (ep) => ep.type === EndpointType.OASF
    );

    if (oasfEndpoint && oasfEndpoint.meta) {
      const skills = oasfEndpoint.meta.skills;
      if (Array.isArray(skills)) {
        const index = skills.indexOf(slug);
        if (index !== -1) {
          skills.splice(index, 1);
        }
      }
      this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    }

    return this;
  }

  addDomain(slug: string, validateOASF: boolean = false): this {
    /**
     * Add a domain to the OASF endpoint.
     * @param slug The domain slug to add (e.g., "finance_and_business/investment_services")
     * @param validateOASF If true, validate the slug against the OASF taxonomy (default: false)
     * @returns this for method chaining
     * @throws Error if validateOASF=true and the slug is not valid
     */
    if (validateOASF) {
      if (!validateDomain(slug)) {
        throw new Error(
          `Invalid OASF domain slug: ${slug}. ` +
            'Use validateOASF=false to skip validation.'
        );
      }
    }

    const oasfEndpoint = this._getOrCreateOasfEndpoint();

    // Initialize domains array if missing
    if (!oasfEndpoint.meta) {
      oasfEndpoint.meta = {};
    }
    if (!Array.isArray(oasfEndpoint.meta.domains)) {
      oasfEndpoint.meta.domains = [];
    }

    // Add slug if not already present (avoid duplicates)
    const domains = oasfEndpoint.meta.domains as string[];
    if (!domains.includes(slug)) {
      domains.push(slug);
    }

    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  removeDomain(slug: string): this {
    /**
     * Remove a domain from the OASF endpoint.
     * @param slug The domain slug to remove
     * @returns this for method chaining
     */
    // Find OASF endpoint
    const oasfEndpoint = this.registrationFile.endpoints.find(
      (ep) => ep.type === EndpointType.OASF
    );

    if (oasfEndpoint && oasfEndpoint.meta) {
      const domains = oasfEndpoint.meta.domains;
      if (Array.isArray(domains)) {
        const index = domains.indexOf(slug);
        if (index !== -1) {
          domains.splice(index, 1);
        }
      }
      this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    }

    return this;
  }

  /**
   * Set agent wallet on-chain with EIP-712 signature verification (ERC-8004 Jan 2026).
   *
   * This is a clean breaking API: it is on-chain only.
   * If the agent is not registered yet, this throws.
   */
  async setAgentWallet(
    newWallet: Address,
    opts?: {
      deadline?: number;
      newWalletSigner?: string | ethers.Signer;
      signature?: string | Uint8Array;
    }
  ): Promise<string> {
    if (!this.registrationFile.agentId) {
      throw new Error(
        'Agent must be registered before setting agentWallet on-chain. ' +
          'Register the agent first, then call setAgentWallet().'
      );
    }

    if (!this.sdk.web3Client.signer) {
      throw new Error('No SDK signer available to submit setAgentWallet transaction');
    }

    // Validate newWallet address
    if (!this.sdk.web3Client.isAddress(newWallet)) {
      throw new Error(`Invalid newWallet address: ${newWallet}`);
    }

    const { tokenId } = parseAgentId(this.registrationFile.agentId);
    const identityRegistry = this.sdk.getIdentityRegistry();

    // Optional short-circuit if already set
    try {
      const currentWallet = await this.sdk.web3Client.callContract(
        identityRegistry,
        'getAgentWallet',
        BigInt(tokenId)
      );
      if (
        typeof currentWallet === 'string' &&
        currentWallet.toLowerCase() === newWallet.toLowerCase()
      ) {
        const chainId = await this.sdk.chainId();
        this.registrationFile.walletAddress = newWallet;
    this.registrationFile.walletChainId = chainId;
        this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
        return '';
      }
    } catch {
      // ignore and proceed
    }

    // Deadline: contract enforces a short window. Use chain time (latest block timestamp)
    // rather than local system time to avoid clock skew causing reverts.
    const latestBlock = await this.sdk.web3Client.provider.getBlock('latest');
    const chainNow = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
    const deadlineValue = opts?.deadline ?? chainNow + 60;
    if (deadlineValue < chainNow) {
      throw new Error(`Invalid deadline: ${deadlineValue} is in the past (chain time: ${chainNow})`);
    }
    if (deadlineValue > chainNow + 300) {
      throw new Error(
        `Invalid deadline: ${deadlineValue} is too far in the future. ` +
          `ERC-8004 setAgentWallet requires a short deadline (<= chainTime + 300s). ` +
          `(chain time: ${chainNow})`
      );
    }

    const chainId = await this.sdk.chainId();
    const verifyingContract = await identityRegistry.getAddress();
    const owner = await this.sdk.web3Client.callContract(
      identityRegistry,
      'ownerOf',
      BigInt(tokenId)
    );
    
    // Prefer reading the actual EIP-712 domain from the contract (if supported)
    // to avoid any future divergence in name/version.
    let domainName: string | undefined;
    let domainVersion: string | undefined;
    try {
      const domainInfo = await this.sdk.web3Client.callContract(identityRegistry, 'eip712Domain');
      // eip712Domain() returns: (fields, name, version, chainId, verifyingContract, salt, extensions)
      // In ethers v6 this is typically a Result array-like object.
      domainName = domainInfo?.name ?? domainInfo?.[1];
      domainVersion = domainInfo?.version ?? domainInfo?.[2];
    } catch {
      // ignore and use defaults
    }

    // If the contract exposes a domain separator, try to select a matching (name, version)
    // deterministically from common candidates.
    let domainSeparatorOnChain: string | undefined;
    try {
      domainSeparatorOnChain = await this.sdk.web3Client.callContract(identityRegistry, 'DOMAIN_SEPARATOR');
    } catch {
      // ignore
    }

    // Preflight estimateGas to catch signature/domain/type mismatches early.
    const estimateSetAgentWallet = async (sig: string) => {
      const fn = (identityRegistry as any).getFunction
        ? (identityRegistry as any).getFunction('setAgentWallet')
        : null;
      if (fn?.estimateGas) {
        await fn.estimateGas(BigInt(tokenId), newWallet, BigInt(deadlineValue), sig);
      } else if ((identityRegistry as any).estimateGas?.setAgentWallet) {
        await (identityRegistry as any).estimateGas.setAgentWallet(
          BigInt(tokenId),
          newWallet,
          BigInt(deadlineValue),
          sig
        );
      }
    };

    // Determine signature
    let signature: string | undefined;
    if (opts?.signature) {
      signature =
        typeof opts.signature === 'string' ? opts.signature : ethers.hexlify(opts.signature);
      if (!signature.startsWith('0x')) {
        signature = `0x${signature}`;
      }
    } else {
      // The new wallet MUST sign (EOA path). Support a few domain/type variants to match deployed registries.
      const signerForNewWallet: string | ethers.Signer | undefined = opts?.newWalletSigner;
      const sdkSignerAddress = await this.sdk.web3Client.getAddress();

      // If no explicit signer was provided, allow the one-wallet case (SDK signer == newWallet)
      if (!signerForNewWallet) {
        if (!sdkSignerAddress || sdkSignerAddress.toLowerCase() !== newWallet.toLowerCase()) {
          throw new Error(
            `The new wallet must sign the EIP-712 message. ` +
              `Pass opts.newWalletSigner (private key or Signer) or opts.signature. ` +
              `SDK signer is ${sdkSignerAddress || 'unknown'}, newWallet is ${newWallet}.`
          );
        }
      } else {
        const signerAddress = await this.sdk.web3Client.addressOf(signerForNewWallet as any);
        if (signerAddress.toLowerCase() !== newWallet.toLowerCase()) {
          throw new Error(
            `newWalletSigner address (${signerAddress}) does not match newWallet (${newWallet}).`
          );
        }
      }

      const domainNames: string[] = [];
      if (domainName) domainNames.push(domainName);
      // Common known names across deployments/spec revisions
      domainNames.push('ERC8004IdentityRegistry', 'IdentityRegistry', 'ERC8004IdentityRegistryUpgradeable', 'IdentityRegistryUpgradeable');
      const domainVersions = [domainVersion || '1', '1'];

      // If we have a domain separator, prefer the (name, version) that matches it.
      if (domainSeparatorOnChain) {
        const match = domainNames.flatMap((dn) =>
          domainVersions.map((dv) => ({ dn, dv }))
        ).find(({ dn, dv }) => {
          try {
            const computed = ethers.TypedDataEncoder.hashDomain({
              name: dn,
              version: dv,
              chainId,
              verifyingContract,
            });
            return computed.toLowerCase() === String(domainSeparatorOnChain).toLowerCase();
          } catch {
            return false;
          }
        });
        if (match) {
          domainNames.unshift(match.dn);
          domainVersions.unshift(match.dv);
        }
      }

      // Try (with owner) first, then (no owner) legacy; and try each domain name.
      const variants: Array<{ domain: any; types: any; message: any }> = [];
      for (const dn of domainNames) {
        for (const dv of domainVersions) {
          variants.push(
            this.sdk.web3Client.buildAgentWalletSetTypedData({
              agentId: BigInt(tokenId),
              newWallet,
              owner,
              deadline: BigInt(deadlineValue),
              chainId,
              verifyingContract,
              domainName: dn,
              domainVersion: dv,
            })
          );
          variants.push(
            this.sdk.web3Client.buildAgentWalletSetTypedDataNoOwner({
              agentId: BigInt(tokenId),
              newWallet,
              deadline: BigInt(deadlineValue),
              chainId,
              verifyingContract,
              domainName: dn,
              domainVersion: dv,
            })
          );
        }
      }

      let lastError: unknown;
      const trySignAndEstimate = async (signerMode: 'newWallet' | 'owner') => {
        for (const v of variants) {
          try {
            const sig =
              signerMode === 'newWallet'
                ? signerForNewWallet
                  ? await this.sdk.web3Client.signTypedDataWith(
                      signerForNewWallet as any,
                      v.domain,
                      v.types,
                      v.message
                    )
                  : await this.sdk.web3Client.signTypedData(v.domain, v.types, v.message)
                : await this.sdk.web3Client.signTypedData(v.domain, v.types, v.message);

            const recovered = this.sdk.web3Client.recoverTypedDataSigner(v.domain, v.types, v.message, sig);
            const expected =
              signerMode === 'newWallet' ? newWallet.toLowerCase() : (sdkSignerAddress || '').toLowerCase();
            if (!expected || recovered.toLowerCase() !== expected) {
              throw new Error(
                `EIP-712 signature recovery mismatch (${signerMode} signing): recovered ${recovered} but expected ${expected || 'unknown'}`
              );
            }

            await estimateSetAgentWallet(sig);
            signature = sig;
            return;
          } catch (e) {
            lastError = e;
          }
        }
      };

      // Preferred: newWallet signs (spec-aligned)
      await trySignAndEstimate('newWallet');

      // Fallback: some legacy deployments may require the agent owner (tx sender) to sign instead.
      if (!signature && sdkSignerAddress) {
        await trySignAndEstimate('owner');
      }

      if (!signature) {
        const msg = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Failed to produce a valid setAgentWallet signature for this registry: ${msg}`);
      }
    }

    // Call contract function (tx sender is SDK signer: owner/operator)
    const txHash = await this.sdk.web3Client.transactContract(
      identityRegistry,
      'setAgentWallet',
      {},
      BigInt(tokenId),
      newWallet,
      BigInt(deadlineValue),
      signature
    );

    // Update local registration file
    this.registrationFile.walletAddress = newWallet;
    this.registrationFile.walletChainId = chainId;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);

    return txHash;
  }

  setActive(active: boolean): this {
    this.registrationFile.active = active;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  setX402Support(x402Support: boolean): this {
    this.registrationFile.x402support = x402Support;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  setTrust(
    reputation: boolean = false,
    cryptoEconomic: boolean = false,
    teeAttestation: boolean = false
  ): this {
    const trustModels: (TrustModel | string)[] = [];
    if (reputation) trustModels.push(TrustModel.REPUTATION);
    if (cryptoEconomic) trustModels.push(TrustModel.CRYPTO_ECONOMIC);
    if (teeAttestation) trustModels.push(TrustModel.TEE_ATTESTATION);

    this.registrationFile.trustModels = trustModels;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  setMetadata(kv: Record<string, unknown>): this {
    // Mark all provided keys as dirty
    for (const key of Object.keys(kv)) {
      this._dirtyMetadata.add(key);
    }

    Object.assign(this.registrationFile.metadata, kv);
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  getMetadata(): Record<string, unknown> {
    return { ...this.registrationFile.metadata };
  }

  delMetadata(key: string): this {
    if (key in this.registrationFile.metadata) {
      delete this.registrationFile.metadata[key];
      this._dirtyMetadata.delete(key);
      this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    }
    return this;
  }

  getRegistrationFile(): RegistrationFile {
    return this.registrationFile;
  }

  /**
   * Update basic agent information
   */
  updateInfo(name?: string, description?: string, image?: URI): this {
    if (name !== undefined) {
      this.registrationFile.name = name;
    }
    if (description !== undefined) {
      this.registrationFile.description = description;
    }
    if (image !== undefined) {
      this.registrationFile.image = image;
    }

    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
    return this;
  }

  /**
   * Register agent on-chain with IPFS flow
   */
  async registerIPFS(): Promise<RegistrationFile> {
    // Validate basic info
    if (!this.registrationFile.name || !this.registrationFile.description) {
      throw new Error('Agent must have name and description before registration');
    }

    if (this.registrationFile.agentId) {
      // Agent already registered - update registration file and redeploy
      // Option 2D: Add logging and timeout handling
      const chainId = await this.sdk.chainId();
      const identityRegistryAddress = await this.sdk.getIdentityRegistry().getAddress();
      
      const ipfsCid = await this.sdk.ipfsClient!.addRegistrationFile(
        this.registrationFile,
        chainId,
        identityRegistryAddress
      );

      // Update metadata on-chain if changed
      // Only send transactions for dirty (changed) metadata to save gas
      if (this._dirtyMetadata.size > 0) {
        try {
          await this._updateMetadataOnChain();
        } catch (error) {
          // Transaction was sent and will eventually confirm - continue silently
        }
      }

      // Update agent URI on-chain
      const { tokenId } = parseAgentId(this.registrationFile.agentId);
      
      const txHash = await this.sdk.web3Client.transactContract(
        this.sdk.getIdentityRegistry(),
        'setAgentURI',
        {},
        BigInt(tokenId),
        `ipfs://${ipfsCid}`
      );
      
      // Wait for transaction to be confirmed (30 second timeout like Python)
      // If timeout, continue - transaction was sent and will eventually confirm
      try {
        await this.sdk.web3Client.waitForTransaction(txHash, TIMEOUTS.TRANSACTION_WAIT);
      } catch {
        // Transaction was sent and will eventually confirm - continue silently
      }

      // Clear dirty flags
      this._lastRegisteredWallet = this.walletAddress;
      this._lastRegisteredEns = this.ensEndpoint;
      this._dirtyMetadata.clear();

      this.registrationFile.agentURI = `ipfs://${ipfsCid}`;
      return this.registrationFile;
    } else {
      // First time registration
      // Step 1: Register on-chain without URI
      await this._registerWithoutUri();

      // Step 2: Upload to IPFS
      const chainId = await this.sdk.chainId();
      const identityRegistryAddress = await this.sdk.getIdentityRegistry().getAddress();
      const ipfsCid = await this.sdk.ipfsClient!.addRegistrationFile(
        this.registrationFile,
        chainId,
        identityRegistryAddress
      );

      // Step 3: Set agent URI on-chain
      const { tokenId } = parseAgentId(this.registrationFile.agentId!);
      const txHash = await this.sdk.web3Client.transactContract(
        this.sdk.getIdentityRegistry(),
        'setAgentURI',
        {},
        BigInt(tokenId),
        `ipfs://${ipfsCid}`
      );
      
      // Wait for transaction to be confirmed
      await this.sdk.web3Client.waitForTransaction(txHash);

      // Clear dirty flags
      this._lastRegisteredWallet = this.walletAddress;
      this._lastRegisteredEns = this.ensEndpoint;
      this._dirtyMetadata.clear();

      this.registrationFile.agentURI = `ipfs://${ipfsCid}`;
      return this.registrationFile;
    }
  }

  /**
   * Register agent on-chain with HTTP URI
   */
  async registerHTTP(agentUri: string): Promise<RegistrationFile> {
    // Validate basic info
    if (!this.registrationFile.name || !this.registrationFile.description) {
      throw new Error('Agent must have name and description before registration');
    }

    if (this.registrationFile.agentId) {
      // Agent already registered - update agent URI
      await this.setAgentURI(agentUri);
      return this.registrationFile;
    } else {
      // First time registration
      return await this._registerWithUri(agentUri);
    }
  }

  /**
   * Set agent URI (for updates)
   */
  async setAgentURI(agentURI: string): Promise<void> {
    if (!this.registrationFile.agentId) {
      throw new Error('Agent must be registered before setting URI');
    }

    const { tokenId } = parseAgentId(this.registrationFile.agentId);
    await this.sdk.web3Client.transactContract(
      this.sdk.getIdentityRegistry(),
      'setAgentURI',
      {},
      BigInt(tokenId),
      agentURI
    );

    this.registrationFile.agentURI = agentURI;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
  }

  /**
   * Transfer agent ownership
   */
  async transfer(newOwner: Address): Promise<{ txHash: string; from: Address; to: Address; agentId: AgentId }> {
    if (!this.registrationFile.agentId) {
      throw new Error('Agent must be registered before transfer');
    }

    const { tokenId } = parseAgentId(this.registrationFile.agentId);
    const currentOwner = this.sdk.web3Client.address;
    if (!currentOwner) {
      throw new Error('No signer available');
    }

    // Validate address - normalize to lowercase first
    const normalizedAddress = newOwner.toLowerCase();
    if (!this.sdk.web3Client.isAddress(normalizedAddress)) {
      throw new Error(`Invalid address: ${newOwner}`);
    }

    // Validate not zero address (check before expensive operations)
    if (normalizedAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Cannot transfer agent to zero address');
    }

    // Convert to checksum format
    const checksumAddress = this.sdk.web3Client.toChecksumAddress(normalizedAddress);

    // Validate not transferring to self
    if (checksumAddress.toLowerCase() === currentOwner.toLowerCase()) {
      throw new Error('Cannot transfer agent to yourself');
    }

    const identityRegistry = this.sdk.getIdentityRegistry();
    const txHash = await this.sdk.web3Client.transactContract(
      identityRegistry,
      'transferFrom',
      {},
      currentOwner,
      checksumAddress,
      BigInt(tokenId)
    );

    return {
      txHash,
      from: currentOwner,
      to: checksumAddress,
      agentId: this.registrationFile.agentId,
    };
  }

  /**
   * Private helper methods
   */
  private async _registerWithoutUri(): Promise<void> {
    // Collect metadata for registration
    const metadataEntries = this._collectMetadataForRegistration();

    // Mint agent with metadata
    const identityRegistry = this.sdk.getIdentityRegistry();
    
    // If we have metadata, use register(string, tuple[])
    // Otherwise use register() with no args
    let txHash: string;
    if (metadataEntries.length > 0) {
      txHash = await this.sdk.web3Client.transactContract(
        identityRegistry,
        'register',
        {}, // Transaction options
        '', // Empty tokenUri
        metadataEntries
      );
    } else {
      txHash = await this.sdk.web3Client.transactContract(
        identityRegistry,
        'register',
        {} // Transaction options
        // No arguments - calls register()
      );
    }

    // Wait for transaction
    const receipt = await this.sdk.web3Client.waitForTransaction(txHash);

    // Extract agent ID from events
    const agentId = this._extractAgentIdFromReceipt(receipt);

    // Update registration file
    const chainId = await this.sdk.chainId();
    this.registrationFile.agentId = `${chainId}:${agentId}`;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);
  }

  private async _registerWithUri(agentUri: string): Promise<RegistrationFile> {
    // Collect metadata for registration
    const metadataEntries = this._collectMetadataForRegistration();

    // Register with URI and metadata
    const identityRegistry = this.sdk.getIdentityRegistry();
    const txHash = await this.sdk.web3Client.transactContract(
      identityRegistry,
      'register',
      {},
      agentUri,
      metadataEntries
    );

    // Wait for transaction
    const receipt = await this.sdk.web3Client.waitForTransaction(txHash);

    // Extract agent ID from events
    const agentId = this._extractAgentIdFromReceipt(receipt);

    // Update registration file
    const chainId = await this.sdk.chainId();
    this.registrationFile.agentId = `${chainId}:${agentId}`;
    this.registrationFile.agentURI = agentUri;
    this.registrationFile.updatedAt = Math.floor(Date.now() / 1000);

    return this.registrationFile;
  }

  private async _updateMetadataOnChain(): Promise<void> {
    const metadataEntries = this._collectMetadataForRegistration();
    const { tokenId } = parseAgentId(this.registrationFile.agentId!);
    const identityRegistry = this.sdk.getIdentityRegistry();

    // Update metadata one by one (like Python SDK)
    // Only send transactions for dirty (changed) metadata keys
    for (const entry of metadataEntries) {
      if (this._dirtyMetadata.has(entry.metadataKey)) {
        const txHash = await this.sdk.web3Client.transactContract(
          identityRegistry,
          'setMetadata',
          {},
          BigInt(tokenId),
          entry.metadataKey,
          entry.metadataValue
        );

        // Wait with 30 second timeout (like Python SDK)
        // If timeout, log warning but continue - transaction was sent and will eventually confirm
        try {
          await this.sdk.web3Client.waitForTransaction(txHash, TIMEOUTS.TRANSACTION_WAIT);
        } catch (error) {
          // Transaction was sent and will eventually confirm - continue silently
        }
      }
    }
  }

  private _collectMetadataForRegistration(): Array<{ metadataKey: string; metadataValue: Uint8Array }> {
    const entries: Array<{ metadataKey: string; metadataValue: Uint8Array }> = [];

    // Note: agentWallet is now a reserved metadata key that cannot be set via setMetadata()
    // It must be set using setAgentWallet() with EIP-712 signature verification
    // We do not include it in metadata entries here

    // Collect custom metadata
    for (const [key, value] of Object.entries(this.registrationFile.metadata)) {
      // Skip agentWallet if it somehow got into metadata
      if (key === 'agentWallet') {
        continue;
      }

      let valueBytes: Uint8Array;
      if (typeof value === 'string') {
        valueBytes = new TextEncoder().encode(value);
      } else if (typeof value === 'number') {
        valueBytes = new TextEncoder().encode(value.toString());
      } else {
        valueBytes = new TextEncoder().encode(JSON.stringify(value));
      }

      entries.push({ metadataKey: key, metadataValue: valueBytes });
    }

    return entries;
  }

  private _extractAgentIdFromReceipt(receipt: ethers.ContractTransactionReceipt): bigint {
    // Parse events from receipt to find Registered event
    const identityRegistry = this.sdk.getIdentityRegistry();
    const transferEventTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer(address,address,uint256)

    // Find the event in the logs
    for (const log of receipt.logs || []) {
      try {
        // Try parsing as Registered event
        const parsed = identityRegistry.interface.parseLog({
          topics: Array.isArray(log.topics) ? log.topics.map((t: string | ethers.BytesLike) => typeof t === 'string' ? t : ethers.hexlify(t)) : log.topics || [],
          data: typeof log.data === 'string' ? log.data : ethers.hexlify(log.data || '0x'),
        });
        if (parsed && parsed.name === 'Registered') {
          return BigInt(parsed.args.agentId.toString());
        }
      } catch {
        // Not a Registered event, try Transfer event MP (ERC-721)
        try {
          const topics = Array.isArray(log.topics) ? log.topics : [];
          // Transfer event has topic[0] = Transfer signature, topic[3] = tokenId (if 4 topics)
          if (topics.length >= 4) {
            const topic0 = typeof topics[0] === 'string' ? topics[0] : topics[0].toString();
            if (topic0 === transferEventTopic || topic0.toLowerCase() === transferEventTopic.toLowerCase()) {
              // Extract tokenId from topic[3]
              const tokenIdHex = typeof topics[3] === 'string' ? topics[3] : topics[3].toString();
              // Remove 0x prefix if present and convert
              const tokenIdStr = tokenIdHex.startsWith('0x') ? tokenIdHex.slice(2) : tokenIdHex;
              return BigInt('0x' + tokenIdStr);
            }
          }
        } catch {
          // Continue searching
        }
      }
    }

    // Fallback: try to get total supply and use latest token ID
    // Note: This is async but we're in a sync method, so we'll try to call but it might not work
    // Better to throw error and let caller handle

    throw new Error('Could not extract agent ID from transaction receipt - no Registered or Transfer event found');
  }
}

