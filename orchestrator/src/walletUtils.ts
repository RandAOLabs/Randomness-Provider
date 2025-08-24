import { getKeyPairFromSeed } from "human-crypto-keys";
import type { JWKInterface } from "arweave/web/lib/wallet";
import { passwordStrength } from "check-password-strength";
import { isOneOf, isString } from "typed-assert";
import { wordlists, mnemonicToSeed } from "bip39-web-crypto";
import { generateMnemonic, validateMnemonic } from 'bip39';
import * as fs from 'fs';
import * as path from 'path';
import Arweave from "arweave";

// Initialize Arweave
const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

// Global wallet storage
let globalWallet: JWKInterface | null = null;
let walletSource: 'seed_phrase' | 'json' | null = null;

/**
 * Update or add a variable to the .env file
 * @param key Environment variable key
 * @param value Environment variable value
 */
async function updateEnvVariable(key: string, value: string): Promise<void> {
    try {
        const envPath = path.join('/host-compose', '.env');
        let envContent = '';
        
        // Read existing content if file exists
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Check if the variable already exists
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}="${value}"`;
        
        if (regex.test(envContent)) {
            // Replace existing variable
            envContent = envContent.replace(regex, newLine);
        } else {
            // Add new variable
            envContent += (envContent && !envContent.endsWith('\n') ? '\n' : '') + newLine + '\n';
        }
        
        // Write updated content back to file
        fs.writeFileSync(envPath, envContent, 'utf8');
        
    } catch (error) {
        throw new Error(`Failed to update ${key} in .env file: ${error}`);
    }
}

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
 * Check for missing wallet configuration and generate seed phrase if needed
 * Creates or appends to .env file in docker-compose directory
 */
export async function ensureWalletConfiguration(): Promise<void> {
    const hasSeedPhrase = !!process.env.SEED_PHRASE && 
        process.env.SEED_PHRASE !== "Create a NEW wallet and enter the 12 - 24 words here";
    const hasWalletJson = !!process.env.WALLET_JSON;

    // If either configuration exists in environment variables, we're good
    if (hasSeedPhrase || hasWalletJson) {
        return;
    }

    // Fallback: Check if seed phrase exists in the mounted .env file
    const envPath = path.join('/host-compose', '.env');
    if (fs.existsSync(envPath)) {
        try {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const seedPhraseMatch = envContent.match(/^SEED_PHRASE="(.+)"$/m);
            
            if (seedPhraseMatch && seedPhraseMatch[1]) {
                const existingSeedPhrase = seedPhraseMatch[1];
                if (existingSeedPhrase !== "Create a NEW wallet and enter the 12 - 24 words here") {
                    process.env.SEED_PHRASE = existingSeedPhrase;
                    return;
                }
            }
        } catch (error) {
            // Ignore read errors
        }
    }

    try {
        // Generate a 12-word BIP39-compliant mnemonic
        const mnemonic = generateMnemonic(128); // 128 bits = 12 words
        
        // Validate the generated mnemonic
        if (!validateMnemonic(mnemonic)) {
            throw new Error("Generated mnemonic failed validation");
        }

        // Determine the .env file path (write to host directory via volume mount)
        const envPath = path.join('/host-compose', '.env');
        
        // Prepare the seed phrase entry
        const seedPhraseEntry = `SEED_PHRASE="${mnemonic}"`;
        
        // Check if .env file exists
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Append the seed phrase to the file
        const newContent = envContent + (envContent && !envContent.endsWith('\n') ? '\n' : '') + seedPhraseEntry + '\n';
        fs.writeFileSync(envPath, newContent, 'utf8');
        
        // Set the environment variable for the current process
        process.env.SEED_PHRASE = mnemonic;
        
        console.warn("IMPORTANT: Please backup your seed phrase securely. This is the only way to recover your wallet!");
        
        // Generate and save the provider ID
        try {
            const wallet = await jwkFromMnemonic(mnemonic);
            const providerId = await arweave.wallets.jwkToAddress(wallet);
            await updateEnvVariable('PROVIDER_ID', providerId);
            process.env.PROVIDER_ID = providerId;
        } catch (error) {
            throw new Error(`Failed to generate and save provider ID: ${error}`);
        }
        
    } catch (error) {
        throw new Error(`Wallet configuration setup failed: ${error}`);
    }
}

/**
 * Initialize wallet from environment variables
 * Prioritizes SEED_PHRASE over WALLET_JSON if both are present
 * 
 * @returns JWK wallet object
 */
export async function initializeWallet(): Promise<JWKInterface> {
  // If wallet is already initialized, return it
  if (globalWallet) {
    return globalWallet;
  }

  const hasSeedPhrase = !!process.env.SEED_PHRASE;
  const hasWalletJson = !!process.env.WALLET_JSON;

  if (!hasSeedPhrase && !hasWalletJson) {
    throw new Error("No wallet configuration found. Please provide either SEED_PHRASE or WALLET_JSON in environment variables.");
  }

  let wallet: JWKInterface;

  // Try to load wallet from seed phrase if available
  if (hasSeedPhrase) {
    try {
      const seedPhrase = process.env.SEED_PHRASE!;
      
      const validationResult = isValidMnemonic(seedPhrase);
      
      if (!validationResult) {
        throw new Error("Invalid seed phrase format");
      }
      
      wallet = await jwkFromMnemonic(seedPhrase);
      const seedPhraseAddress = await arweave.wallets.jwkToAddress(wallet);
      
      walletSource = 'seed_phrase';
      globalWallet = wallet;
      
      // Set PROVIDER_ID in .env file
      try {
        await updateEnvVariable('PROVIDER_ID', seedPhraseAddress);
        process.env.PROVIDER_ID = seedPhraseAddress;
      } catch (error) {
        // Ignore env file errors in standalone mode
      }
      
    } catch (error) {
      // Fall back to JSON if available
      if (!hasWalletJson) {
        throw error;
      }
    }
  }

  // If we haven't successfully initialized the wallet from seed phrase, try JSON
  if (!globalWallet && hasWalletJson) {
    try {
      wallet = JSON.parse(process.env.WALLET_JSON!);
      const jsonAddress = await arweave.wallets.jwkToAddress(wallet);
      
      walletSource = 'json';
      globalWallet = wallet;
      
      // Set PROVIDER_ID in .env file
      try {
        await updateEnvVariable('PROVIDER_ID', jsonAddress);
        process.env.PROVIDER_ID = jsonAddress;
      } catch (error) {
        // Ignore env file errors in standalone mode
      }
    } catch (error) {
      throw new Error(`Failed to initialize wallet from WALLET_JSON: ${error}`);
    }
  }

  return globalWallet!;
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

/**
 * CLI function to get address from mnemonic
 * Usage: npx ts-node walletUtils.ts "word1 word2 ... word12"
 */
async function getAddressFromMnemonic(mnemonic: string): Promise<string> {
  try {
    const validationResult = isValidMnemonic(mnemonic);
    if (!validationResult) {
      throw new Error("Invalid mnemonic phrase");
    }
    
    const wallet = await jwkFromMnemonic(mnemonic);
    const address = await arweave.wallets.jwkToAddress(wallet);
    return address;
  } catch (error) {
    throw new Error(`Failed to generate address from mnemonic: ${error}`);
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.error('Usage: npx ts-node walletUtils.ts "word1 word2 ... word12"');
    process.exit(1);
  }
  
  const mnemonic = args[0];
  
  getAddressFromMnemonic(mnemonic)
    .then(address => {
      console.log(address);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
