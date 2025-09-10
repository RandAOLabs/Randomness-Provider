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

/**
 * Update or add a variable to the .env file
 * @param key Environment variable key
 * @param value Environment variable value
 */
async function updateEnvVariable(key: string, value: string): Promise<void> {
    try {
        const envPath = path.join('/host-compose', '.env');
        let envContent = '';
        
        // Create directory if it doesn't exist
        const envDir = path.dirname(envPath);
        if (!fs.existsSync(envDir)) {
            fs.mkdirSync(envDir, { recursive: true });
        }
        
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
 * Update or add a variable to the .env file using single quotes
 * @param key Environment variable key
 * @param value Environment variable value
 */
async function updateEnvVariableWithSingleQuotes(key: string, value: string): Promise<void> {
    try {
        const envPath = path.join('/host-compose', '.env');
        let envContent = '';
        
        // Create directory if it doesn't exist
        const envDir = path.dirname(envPath);
        if (!fs.existsSync(envDir)) {
            fs.mkdirSync(envDir, { recursive: true });
        }
        
        // Read existing content if file exists
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Check if the variable already exists
        const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
        const newLine = `${key} = '${value}'`;
        
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
 * Initialize wallet configuration - loads existing or creates new
 */
export async function ensureWalletConfiguration(): Promise<void> {
    // Try existing wallet JSON first
    let walletJson = loadWalletJson();
    if (walletJson) {
        const wallet = JSON.parse(walletJson);
        const providerId = await arweave.wallets.jwkToAddress(wallet);
        process.env.WALLET_JSON = walletJson;
        process.env.PROVIDER_ID = providerId;
        await updateEnvVariable('PROVIDER_ID', providerId);
        return;
    }
    
    // Try existing seed phrase
    let seedPhrase = loadSeedPhrase();
    if (seedPhrase) {
        const wallet = await jwkFromMnemonic(seedPhrase);
        walletJson = JSON.stringify(wallet);
        const providerId = await arweave.wallets.jwkToAddress(wallet);
        
        await updateEnvVariableWithSingleQuotes('WALLET_JSON', walletJson);
        await updateEnvVariable('PROVIDER_ID', providerId);
        
        process.env.WALLET_JSON = walletJson;
        process.env.PROVIDER_ID = providerId;
        return;
    }
    
    // Create new wallet
    seedPhrase = generateMnemonic(128);
    const wallet = await jwkFromMnemonic(seedPhrase);
    walletJson = JSON.stringify(wallet);
    const providerId = await arweave.wallets.jwkToAddress(wallet);
    
    await updateEnvVariable('SEED_PHRASE', seedPhrase);
    await updateEnvVariableWithSingleQuotes('WALLET_JSON', walletJson);
    await updateEnvVariable('PROVIDER_ID', providerId);
    
    process.env.SEED_PHRASE = seedPhrase;
    process.env.WALLET_JSON = walletJson;
    process.env.PROVIDER_ID = providerId;
    
    console.log(`New wallet created. Seed phrase: ${seedPhrase}`);
}

/**
 * Load wallet JSON from environment or .env file
 */
function loadWalletJson(): string | null {
    if (process.env.WALLET_JSON) {
        return process.env.WALLET_JSON;
    }
    
    const envPath = path.join('/host-compose', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const walletJsonMatch = envContent.match(/^WALLET_JSON\s*=\s*'(.+)'$/ms);
        if (walletJsonMatch) {
            return walletJsonMatch[1];
        }
    }
    
    return null;
}

/**
 * Load seed phrase from environment or .env file
 */
function loadSeedPhrase(): string | null {
    if (process.env.SEED_PHRASE && process.env.SEED_PHRASE !== "Create a NEW wallet and enter the 12 - 24 words here") {
        return process.env.SEED_PHRASE;
    }
    
    const envPath = path.join('/host-compose', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const seedPhraseMatch = envContent.match(/^SEED_PHRASE="(.+)"$/m);
        if (seedPhraseMatch && seedPhraseMatch[1] !== "Create a NEW wallet and enter the 12 - 24 words here") {
            return seedPhraseMatch[1];
        }
    }
    
    return null;
}


/**
 * Get the wallet JWK interface
 */
export async function getWallet(): Promise<JWKInterface> {
    if (globalWallet) {
        return globalWallet;
    }
    
    if (!process.env.WALLET_JSON) {
        throw new Error('WALLET_JSON not found. Call ensureWalletConfiguration first.');
    }
    
    globalWallet = JSON.parse(process.env.WALLET_JSON);
    return globalWallet!;
}

/**
 * Initialize wallet from environment variables (DEPRECATED - use getWallet instead)
 */
export async function initializeWallet(): Promise<JWKInterface> {
  return await getWallet();
}

/**
 * Get wallet address
 * 
 * @returns Provider ID/wallet address
 */
export async function getWalletAddress(): Promise<string> {
  const wallet = await getWallet();
  return await arweave.wallets.jwkToAddress(wallet);
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
