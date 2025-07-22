import { getKeyPairFromSeed } from "human-crypto-keys";
import type { JWKInterface } from "arweave/web/lib/wallet";
import { passwordStrength } from "check-password-strength";
import { isOneOf, isString } from "typed-assert";
import { wordlists, mnemonicToSeed } from "bip39-web-crypto";
import logger from "./logger";
import Arweave from "arweave";
import * as fs from 'fs/promises'; // <-- Import Node.js file system promises module


// Initialize Arweave
const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

// Global wallet storage
let globalWallet: JWKInterface | null = null;
let walletSource: 'seed_phrase' | 'json' | 'json_file' | 'seed_file' | null = null; // Added file sources


/**
 * Credits to arweave.app for the mnemonic wallet generation
 *
 * https://github.com/jfbeats/ArweaveWebWallet/blob/master/src/functions/Wallets.ts
 * https://github.com/jfbeats/ArweaveWebWallet/blob/master/src/functions/Crypto.ts
 */

/**
 * Generate a JWK from a mnemonic seedphrase
 *
 * @param mnemonic Mnemonic seedphrase to generate wallet from
 * @returns Wallet JWK
 */
export async function jwkFromMnemonic(mnemonic: string): Promise<JWKInterface> {
  // TODO: We use `mnemonicToSeed()` from `bip39-web-crypto` here instead of using `getKeyPairFromMnemonic`, which
  // internally uses `bip39`. Instead, we should just be using `getKeyPairFromMnemonic` and lazy load this dependency:
  //
  // For additional context, see https://www.notion.so/community-labs/Human-Crypto-Keys-reported-Bug-d3a8910dabb6460da814def62665181a

  const seedBuffer = await mnemonicToSeed(mnemonic);

  const { privateKey } = await getKeyPairFromSeed(
    //@ts-ignore
    seedBuffer,
    {
      id: "rsa",
      modulusLength: 4096,
    },
    { privateKeyFormat: "pkcs8-der" },
  );
  const jwk = await pkcs8ToJwk(privateKey as any);

  return jwk;
}

/**
 * Convert a PKCS8 private key to a JWK
 *
 * @param privateKey PKCS8 private key to convert
 * @returns JWK
 */
export async function pkcs8ToJwk(privateKey: Uint8Array): Promise<JWKInterface> {
  // Need to adapt for Node.js environment as the original uses window.crypto
  const crypto = require('crypto').webcrypto;
  
  const key = await crypto.subtle.importKey(
    "pkcs8", 
    privateKey, 
    { name: "RSA-PSS", hash: "SHA-256" }, 
    true, 
    ["sign"]
  );
  
  const jwk = await crypto.subtle.exportKey("jwk", key);

  return {
    kty: jwk.kty!,
    e: jwk.e!,
    n: jwk.n!,
    d: jwk.d,
    p: jwk.p,
    q: jwk.q,
    dp: jwk.dp,
    dq: jwk.dq,
    qi: jwk.qi,
  };
}

/**
 * Check password strength
 *
 * @param password Password to check
 */
export function checkPasswordValid(password: string): boolean {
  const strength = passwordStrength(password);

  return strength.id === 3;
}

/**
 * Validate if a string is a valid mnemonic phrase
 * 
 * @param mnemonic Mnemonic to validate
 * @returns Length of the mnemonic if valid
 */
export function isValidMnemonic(mnemonic: string): number {
  isString(mnemonic, "Mnemonic has to be a string.");

  const words = mnemonic.split(" ");

  isOneOf(words.length, [12, 18, 24], "Invalid mnemonic length.");

  const wordlist = wordlists.english;

  for (const word of words) {
    isOneOf(word, wordlist, "Invalid word in mnemonic.");
  }

  return words.length;
}


/**
 * Initialize wallet from environment variables or files
 * Prioritizes SEED_PHRASE_FILE > WALLET_JSON_FILE > SEED_PHRASE > WALLET_JSON
 *
 * @returns JWK wallet object
 */
export async function initializeWallet(): Promise<JWKInterface> {
  // If wallet is already initialized, return it
  if (globalWallet) {
    return globalWallet;
  }

  // --- New: Check for file paths first ---
  const hasSeedFile = !!process.env.SEED_FILE_PATH;
  const hasWalletJsonFile = !!process.env.WALLET_JSON_FILE_PATH;

  // --- Existing: Check for direct environment variables ---
  const hasSeedPhrase = !!process.env.SEED_PHRASE;
  const hasWalletJson = !!process.env.WALLET_JSON;

  if (!hasSeedFile && !hasWalletJsonFile && !hasSeedPhrase && !hasWalletJson) {
    throw new Error("No wallet configuration found. Please provide SEED_FILE_PATH, WALLET_JSON_FILE_PATH, SEED_PHRASE, or WALLET_JSON in environment variables.");
  }

  let wallet: JWKInterface;
  let seedPhraseAddress: string | undefined;
  let jsonAddress: string | undefined;

  // --- Priority 1: From Seed Phrase File ---
  if (hasSeedFile) {
    try {
      const seedPhrase = await fs.readFile(process.env.SEED_FILE_PATH!, 'utf8');
      if (!isValidMnemonic(seedPhrase.trim())) { // .trim() to remove potential newlines
        throw new Error("Invalid seed phrase format in file");
      }
      wallet = await jwkFromMnemonic(seedPhrase.trim());
      seedPhraseAddress = await arweave.wallets.jwkToAddress(wallet);
      walletSource = 'seed_file';
      globalWallet = wallet;
      logger.info(`Using wallet from SEED_FILE_PATH with address: ${seedPhraseAddress}`);
      return globalWallet; // Exit early if successful
    } catch (error) {
      logger.error(`Failed to initialize wallet from SEED_FILE_PATH (${process.env.SEED_FILE_PATH!})`, error);
      // Fall through to next options if file loading failed
    }
  }

  // --- Priority 2: From Wallet JSON File ---
  if (!globalWallet && hasWalletJsonFile) {
    try {
      const jsonString = await fs.readFile(process.env.WALLET_JSON_FILE_PATH!, 'utf8');
      wallet = JSON.parse(jsonString);
      jsonAddress = await arweave.wallets.jwkToAddress(wallet);
      walletSource = 'json_file';
      globalWallet = wallet;
      logger.info(`Using wallet from WALLET_JSON_FILE_PATH with address: ${jsonAddress}`);
      return globalWallet; // Exit early if successful
    } catch (error) {
      logger.error(`Failed to initialize wallet from WALLET_JSON_FILE_PATH (${process.env.WALLET_JSON_FILE_PATH!})`, error);
      // Fall through to original env var options
    }
  }

  // --- Priority 3: From SEED_PHRASE environment variable (original logic) ---
  if (!globalWallet && hasSeedPhrase) { // Ensure it hasn't been set by file
    try {
      const seedPhrase = process.env.SEED_PHRASE!;
      if (!isValidMnemonic(seedPhrase)) {
        throw new Error("Invalid seed phrase format");
      }
      wallet = await jwkFromMnemonic(seedPhrase);
      seedPhraseAddress = await arweave.wallets.jwkToAddress(wallet);
      walletSource = 'seed_phrase';
      globalWallet = wallet;
      logger.info(`Using wallet from SEED_PHRASE with address: ${seedPhraseAddress}`);
      // ... (comparison logic if hasWalletJson is also true, as in original) ...
      return globalWallet;
    } catch (error) {
      logger.error("Failed to initialize wallet from SEED_PHRASE", error);
      // Fall through to JSON env var
    }
  }

  // --- Priority 4: From WALLET_JSON environment variable (original logic) ---
  if (!globalWallet && hasWalletJson) { // Ensure it hasn't been set by previous methods
    try {
      wallet = JSON.parse(process.env.WALLET_JSON!);
      jsonAddress = await arweave.wallets.jwkToAddress(wallet);
      walletSource = 'json';
      globalWallet = wallet;
      logger.info(`Using wallet from WALLET_JSON with address: ${jsonAddress}`);
      return globalWallet;
    } catch (error) {
      throw new Error(`Failed to initialize wallet from WALLET_JSON: ${error}`);
    }
  }

  // If here, no wallet was successfully initialized
  throw new Error("No wallet configuration successfully initialized from any source.");
}


/**
 * Get wallet address
 * 
 * @returns Provider ID/wallet address
 */
export async function getWalletAddress(): Promise<string> {
  const wallet = await initializeWallet();
  return await arweave.wallets.jwkToAddress(wallet);
}

/**
 * Get the wallet for signing transactions
 * 
 * @returns JWK wallet object
 */
export async function getWallet(): Promise<JWKInterface> {
  return await initializeWallet();
}
