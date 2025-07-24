import { getKeyPairFromSeed } from "human-crypto-keys";
import type { JWKInterface } from "arweave/web/lib/wallet";
import { passwordStrength } from "check-password-strength";
import { isOneOf, isString } from "typed-assert";
import { wordlists, mnemonicToSeed } from "bip39-web-crypto";
import logger from "./logger";
import Arweave from "arweave";
import * as fs from 'fs/promises';

// --- Configuration ---

// ⭐ Recommendation: Externalize Arweave configuration for flexibility.
const arweave = Arweave.init({
  host: process.env.ARWEAVE_HOST || "arweave.net",
  port: process.env.ARWEAVE_PORT ? parseInt(process.env.ARWEAVE_PORT, 10) : 443,
  protocol: process.env.ARWEAVE_PROTOCOL || "https",
});

// ⭐ Recommendation: Avoid magic numbers by defining them as constants.
const STRONG_PASSWORD_LEVEL = 3; // Corresponds to 'Strong' in check-password-strength

// ⭐ Recommendation: Create a Set for efficient mnemonic validation (O(1) lookup).
const englishWordlistSet = new Set(wordlists.english);


// --- Global State ---
let globalWallet: JWKInterface | null = null;
let walletSource: 'seed_file' | 'json_file' | 'seed_phrase' | 'json_string' | null = null;


// --- Core Crypto Functions ---

/**
 * Generate a JWK from a mnemonic seedphrase.
 *
 * @param mnemonic Mnemonic seedphrase to generate wallet from.
 * @returns Wallet JWK.
 */
export async function jwkFromMnemonic(mnemonic: string): Promise<JWKInterface> {
  // TODO: As noted in the original code, this should be replaced.
  // Use `getKeyPairFromMnemonic` from `human-crypto-keys` for a more direct and efficient implementation.
  // See: https://www.notion.so/community-labs/Human-Crypto-Keys-reported-Bug-d3a8910dabb6460da814def62665181a

  const seedBuffer = await mnemonicToSeed(mnemonic);

  // Recommendation: Investigate and fix the need for @ts-ignore.
  // The type of `seedBuffer` (likely Uint8Array) might differ from what `getKeyPairFromSeed` expects in Node.js (e.g., a Buffer).
  // A potential fix could be `Buffer.from(seedBuffer)`.
  const { privateKey } = await getKeyPairFromSeed(
    //@ts-ignore
    seedBuffer,
    { id: "rsa", modulusLength: 4096 },
    { privateKeyFormat: "pkcs8-der" },
  );

  // Recommendation: Investigate and fix the need for `as any`.
  const jwk = await pkcs8ToJwk(privateKey as any);

  return jwk;
}

/**
 * Convert a PKCS8 private key to a JWK using Node.js's native crypto.
 *
 * @param privateKey PKCS8 private key to convert.
 * @returns JWK.
 */
export async function pkcs8ToJwk(privateKey: Uint8Array): Promise<JWKInterface> {
  const crypto = require('crypto').webcrypto;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKey,
    { name: "RSA-PSS", hash: "SHA-256" },
    true,
    ["sign"]
  );

  const jwk = await crypto.subtle.exportKey("jwk", key);

  // The explicit mapping is safe but could potentially be simplified
  // if Arweave's JWKInterface is compatible with the standard JsonWebKey type.
  return {
    kty: jwk.kty!, e: jwk.e!, n: jwk.n!,
    d: jwk.d, p: jwk.p, q: jwk.q,
    dp: jwk.dp, dq: jwk.dq, qi: jwk.qi,
  };
}

// --- Validation Functions ---

/**
 * Check if a password is rated as "Strong".
 *
 * @param password Password to check.
 */
export function checkPasswordValid(password: string): boolean {
  const strength = passwordStrength(password);
  return strength.id === STRONG_PASSWORD_LEVEL;
}

/**
 * Validate if a string is a valid BIP-39 mnemonic phrase using an efficient Set lookup.
 * * @param mnemonic Mnemonic to validate.
 * @returns `true` if the mnemonic is valid, otherwise `false`.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  try {
    isString(mnemonic, "Mnemonic has to be a string.");
    const words = mnemonic.trim().split(" ");
    isOneOf(words.length, [12, 18, 24], "Invalid mnemonic length.");

    for (const word of words) {
      if (!englishWordlistSet.has(word)) {
        logger.warn(`Invalid word found in mnemonic: "${word}"`);
        return false;
      }
    }
    return true;
  } catch (error) {
    logger.error("Mnemonic validation failed", error);
    return false;
  }
}


// --- Wallet Initialization & Access ---

/**
 * ⭐ Recommendation: Refactored `initializeWallet`.
 * Initializes the global wallet by trying a series of sources in a defined order of priority.
 * This approach is more modular and easier to maintain.
 *
 * @returns JWK wallet object.
 */
export async function initializeWallet(): Promise<JWKInterface> {
  if (globalWallet) {
    logger.debug("[DEBUG] Wallet already initialized. Returning existing wallet.");
    return globalWallet;
  }

  // Define wallet sources in order of priority.
  // The 'path' property for env var sources is just for logging clarity.
  const sources = [
    {
      type: 'seed_file',
      path: process.env.SEED_FILE_PATH,
      enabled: !!process.env.SEED_FILE_PATH,
      load: async () => {
        logger.debug(`[DEBUG] Attempting to load wallet from SEED_FILE_PATH: ${process.env.SEED_FILE_PATH}`);
        const seed = await fs.readFile(process.env.SEED_FILE_PATH!, 'utf8');
        logger.debug(`[DEBUG] Read seed string from file (first 50 chars): "${seed.trim().substring(0, 50)}..."`);
        if (!isValidMnemonic(seed)) throw new Error("Invalid mnemonic format in file.");
        return jwkFromMnemonic(seed.trim());
      },
    },
    {
      type: 'json_file',
      path: process.env.WALLET_JSON_FILE_PATH,
      enabled: !!process.env.WALLET_JSON_FILE_PATH,
      load: async () => {
        logger.debug(`[DEBUG] Attempting to load wallet from WALLET_JSON_FILE_PATH: ${process.env.WALLET_JSON_FILE_PATH}`);
        const jsonString = await fs.readFile(process.env.WALLET_JSON_FILE_PATH!, 'utf8');
        logger.debug(`[DEBUG] Read JSON string from file (first 50 chars): "${jsonString.trim().substring(0, 50)}..."`);
        return JSON.parse(jsonString);
      },
    },
    {
      type: 'seed_phrase',
      path: "env var", // Placeholder for logging
      enabled: !!process.env.SEED_PHRASE,
      load: async () => {
        logger.debug(`[DEBUG] Attempting to load wallet from SEED_PHRASE env var.`);
        const seed = process.env.SEED_PHRASE!;
        logger.debug(`[DEBUG] SEED_PHRASE env var content (first 50 chars): "${seed.trim().substring(0, 50)}..."`);
        if (!isValidMnemonic(seed)) throw new Error("Invalid mnemonic format in env var.");
        return jwkFromMnemonic(seed.trim());
      },
    },
    {
      type: 'json_string',
      path: "env var", // Placeholder for logging
      enabled: !!process.env.WALLET_JSON,
      load: async () => {
        logger.debug(`[DEBUG] Attempting to load wallet from WALLET_JSON env var.`);
        const jsonString = process.env.WALLET_JSON!;
        logger.debug(`[DEBUG] WALLET_JSON env var content (first 50 chars): "${jsonString.trim().substring(0, 50)}..."`);
        return JSON.parse(jsonString);
      },
    },
  ] as const; // <--- This 'as const' is critical for type inference

  for (const source of sources) {
    if (source.enabled) {
      logger.debug(`[DEBUG] Checking wallet source: ${source.type.toUpperCase()}`);
      try {
        const wallet = await source.load(); // wallet is JWKInterface
        const address = await arweave.wallets.jwkToAddress(wallet);

        logger.info(`Wallet initialized from ${source.type.toUpperCase()} with address: ${address}`);
        if (source.path && source.path !== "env var") { // Log path only if it's a file path
          logger.info(`Wallet source path: ${source.path}`);
        }

        globalWallet = wallet; // Assign to globalWallet for future calls
        walletSource = source.type; // This assignment is now type-safe due to 'as const'

        return wallet; // <--- Directly return 'wallet' which is guaranteed JWKInterface

      } catch (error) {
        logger.error(`Failed to load wallet from ${source.type.toUpperCase()} (${source.path || 'no path specified'}): ${error instanceof Error ? error.message : String(error)}`);
        logger.debug(`[DEBUG] Full error details for ${source.type.toUpperCase()}:`, error);
        // Fall through to the next source.
      }
    } else {
      logger.debug(`[DEBUG] Wallet source ${source.type.toUpperCase()} is not enabled or not configured.`);
    }
  }

  // If the loop completes without successfully returning a wallet,
  // then we throw an error as no wallet could be initialized.
  throw new Error("No wallet configuration could be successfully initialized from any source. Please check environment variables and file paths.");
}

/**
 * Get the initialized wallet's address.
 * * @returns The wallet address string.
 */
export async function getWalletAddress(): Promise<string> {
  const wallet = await initializeWallet();
  return arweave.wallets.jwkToAddress(wallet);
}

/**
 * Get the initialized wallet for signing transactions.
 * * @returns The JWK wallet object.
 */
export async function getWallet(): Promise<JWKInterface> {
  return initializeWallet();
}