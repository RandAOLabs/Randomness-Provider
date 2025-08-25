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
 * Generate a JWK from a mnemonic seedphrase with detailed logging
 */
async function jwkFromMnemonic(mnemonic) {
  console.log('  🌱 Converting mnemonic to seed...');
  const seedStart = Date.now();
  const seedBuffer = await mnemonicToSeed(mnemonic);
  console.log(`  ✅ Seed generated (${Date.now() - seedStart}ms)`);

  console.log('  🔑 Generating RSA key pair (this is the slow part on low-power devices)...');
  const keyStart = Date.now();
  const { privateKey } = await getKeyPairFromSeed(
    seedBuffer,
    {
      id: "rsa",
      modulusLength: 4096,
    },
    { privateKeyFormat: "pkcs8-der" },
  );
  console.log(`  ✅ RSA key pair generated (${Date.now() - keyStart}ms)`);
  
  console.log('  🔄 Converting to JWK format...');
  const jwkStart = Date.now();
  const jwk = await pkcs8ToJwk(privateKey);
  console.log(`  ✅ JWK conversion complete (${Date.now() - jwkStart}ms)`);
  
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
 * Get address from mnemonic with performance logging
 */
async function getAddressFromMnemonic(mnemonic) {
  try {
    console.log('🔍 Starting wallet address generation...');
    const startTime = Date.now();
    
    console.log('📝 Validating mnemonic phrase...');
    const validationStart = Date.now();
    const validationResult = isValidMnemonic(mnemonic);
    if (!validationResult) {
      throw new Error("Invalid mnemonic phrase");
    }
    console.log(`✅ Mnemonic validated (${Date.now() - validationStart}ms)`);
    
    console.log('🔐 Generating wallet from mnemonic (this may take several minutes on low-power devices)...');
    const walletStart = Date.now();
    const wallet = await jwkFromMnemonic(mnemonic);
    console.log(`✅ Wallet generated (${Date.now() - walletStart}ms)`);
    
    console.log('🏷️ Converting wallet to address...');
    const addressStart = Date.now();
    const address = await arweave.wallets.jwkToAddress(wallet);
    console.log(`✅ Address generated (${Date.now() - addressStart}ms)`);
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 Total time: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
    
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
  
  // Log system information for debugging
  console.log('💻 System Information:');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Memory: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB heap`);
  console.log(`  CPU cores: ${require('os').cpus().length}`);
  console.log('');
  
  const mnemonic = args[0];
  
  getAddressFromMnemonic(mnemonic)
    .then(address => {
      console.log('');
      console.log('🎯 Wallet Address:');
      console.log(address);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = {
  getAddressFromMnemonic,
  jwkFromMnemonic,
  isValidMnemonic
};
