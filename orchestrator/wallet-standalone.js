#!/usr/bin/env node

// Standalone wallet address generator
// Usage: node wallet-standalone.js "12 word mnemonic phrase"

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Import required modules with error handling
let Arweave, bip39, mnemonicToSeed, getKeyPairFromSeed, isOneOf, isString, wordlists;

try {
  Arweave = require('arweave');
  bip39 = require('bip39');
  const bip39WebCrypto = require('bip39-web-crypto');
  mnemonicToSeed = bip39WebCrypto.mnemonicToSeed;
  wordlists = bip39WebCrypto.wordlists;
  const humanCryptoKeys = require('human-crypto-keys');
  getKeyPairFromSeed = humanCryptoKeys.getKeyPairFromSeed;
  const typedAssert = require('typed-assert');
  isOneOf = typedAssert.isOneOf;
  isString = typedAssert.isString;
} catch (error) {
  console.error('Error loading required modules:', error.message);
  console.error('Make sure you have run "npm install" in the orchestrator directory');
  process.exit(1);
}

// Initialize Arweave
const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

/**
 * Convert a PKCS8 private key to a JWK
 */
async function pkcs8ToJwk(privateKey) {
  const cryptoSubtle = crypto.webcrypto.subtle;
  
  const key = await cryptoSubtle.importKey(
    "pkcs8", 
    privateKey, 
    { name: "RSA-PSS", hash: "SHA-256" }, 
    true, 
    ["sign"]
  );
  
  const jwk = await cryptoSubtle.exportKey("jwk", key);

  return {
    kty: jwk.kty,
    e: jwk.e,
    n: jwk.n,
    d: jwk.d,
    p: jwk.p,
    q: jwk.q,
    dp: jwk.dp,
    dq: jwk.dq,
    qi: jwk.qi,
  };
}

/**
 * Generate a JWK from a mnemonic seedphrase
 */
async function jwkFromMnemonic(mnemonic) {
  const seedBuffer = await mnemonicToSeed(mnemonic);

  const { privateKey } = await getKeyPairFromSeed(
    seedBuffer,
    {
      id: "rsa",
      modulusLength: 4096,
    },
    { privateKeyFormat: "pkcs8-der" },
  );
  
  const jwk = await pkcs8ToJwk(privateKey);
  return jwk;
}

/**
 * Validate if a string is a valid mnemonic phrase
 */
function isValidMnemonic(mnemonic) {
  try {
    isString(mnemonic, "Mnemonic has to be a string.");

    const words = mnemonic.split(" ");
    isOneOf(words.length, [12, 18, 24], "Invalid mnemonic length.");

    const wordlist = wordlists.english;

    for (const word of words) {
      isOneOf(word, wordlist, "Invalid word in mnemonic.");
    }

    return words.length;
  } catch (error) {
    return false;
  }
}

/**
 * Get address from mnemonic
 */
async function getAddressFromMnemonic(mnemonic) {
  try {
    const validationResult = isValidMnemonic(mnemonic);
    if (!validationResult) {
      throw new Error("Invalid mnemonic phrase");
    }
    
    const wallet = await jwkFromMnemonic(mnemonic);
    const address = await arweave.wallets.jwkToAddress(wallet);
    return address;
  } catch (error) {
    throw new Error(`Failed to generate address from mnemonic: ${error.message}`);
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.error('Usage: node wallet-standalone.js "word1 word2 ... word12"');
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

module.exports = {
  getAddressFromMnemonic,
  jwkFromMnemonic,
  isValidMnemonic
};
