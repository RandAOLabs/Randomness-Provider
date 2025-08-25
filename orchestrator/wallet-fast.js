#!/usr/bin/env node

// Fast wallet address generator optimized for low-power devices
// Uses caching and optimized crypto operations
// Usage: node wallet-fast.js "12 word mnemonic phrase"

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// Cache directory for storing computed wallets
const CACHE_DIR = path.join(os.tmpdir(), 'arweave-wallet-cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate a cache key from mnemonic
 */
function getCacheKey(mnemonic) {
  return crypto.createHash('sha256').update(mnemonic).digest('hex');
}

/**
 * Check if wallet is cached
 */
function getCachedWallet(mnemonic) {
  try {
    const cacheKey = getCacheKey(mnemonic);
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log('💾 Found cached wallet, skipping expensive crypto operations!');
      return cached;
    }
  } catch (error) {
    // Ignore cache errors
  }
  return null;
}

/**
 * Cache wallet for future use
 */
function cacheWallet(mnemonic, wallet, address) {
  try {
    const cacheKey = getCacheKey(mnemonic);
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    
    fs.writeFileSync(cachePath, JSON.stringify({
      wallet,
      address,
      timestamp: Date.now()
    }), 'utf8');
    
    console.log('💾 Wallet cached for future use');
  } catch (error) {
    // Ignore cache errors
  }
}

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
 * Generate a JWK from a mnemonic seedphrase with optimizations
 */
async function jwkFromMnemonic(mnemonic) {
  console.log('  🌱 Converting mnemonic to seed...');
  const seedStart = Date.now();
  const seedBuffer = await mnemonicToSeed(mnemonic);
  console.log(`  ✅ Seed generated (${Date.now() - seedStart}ms)`);

  console.log('  🔑 Generating RSA key pair...');
  console.log('     ⚠️  This will take 5-15 minutes on Orange Pi Zero W 3');
  console.log('     💡 Consider using a more powerful device for initial generation');
  
  const keyStart = Date.now();
  const { privateKey } = await getKeyPairFromSeed(
    seedBuffer,
    {
      id: "rsa",
      modulusLength: 4096,
    },
    { privateKeyFormat: "pkcs8-der" },
  );
  
  const keyTime = Date.now() - keyStart;
  console.log(`  ✅ RSA key pair generated (${keyTime}ms = ${(keyTime/1000/60).toFixed(1)} minutes)`);
  
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
 * Get address from mnemonic with caching and performance logging
 */
async function getAddressFromMnemonic(mnemonic) {
  try {
    console.log('🔍 Starting wallet address generation...');
    const startTime = Date.now();
    
    // Check cache first
    const cached = getCachedWallet(mnemonic);
    if (cached) {
      console.log(`🎯 Cached Address: ${cached.address}`);
      console.log(`⚡ Total time: ${Date.now() - startTime}ms (cached)`);
      return cached.address;
    }
    
    console.log('📝 Validating mnemonic phrase...');
    const validationStart = Date.now();
    const validationResult = isValidMnemonic(mnemonic);
    if (!validationResult) {
      throw new Error("Invalid mnemonic phrase");
    }
    console.log(`✅ Mnemonic validated (${Date.now() - validationStart}ms)`);
    
    console.log('🔐 Generating wallet from mnemonic...');
    const walletStart = Date.now();
    const wallet = await jwkFromMnemonic(mnemonic);
    console.log(`✅ Wallet generated (${Date.now() - walletStart}ms)`);
    
    console.log('🏷️ Converting wallet to address...');
    const addressStart = Date.now();
    const address = await arweave.wallets.jwkToAddress(wallet);
    console.log(`✅ Address generated (${Date.now() - addressStart}ms)`);
    
    // Cache the result
    cacheWallet(mnemonic, wallet, address);
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 Total time: ${totalTime}ms (${(totalTime/1000/60).toFixed(1)} minutes)`);
    
    return address;
  } catch (error) {
    throw new Error(`Failed to generate address from mnemonic: ${error.message}`);
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.error('Usage: node wallet-fast.js "word1 word2 ... word12"');
    process.exit(1);
  }
  
  // Log system information for debugging
  console.log('💻 System Information:');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Memory: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB heap`);
  console.log(`  CPU cores: ${require('os').cpus().length}`);
  console.log(`  Cache dir: ${CACHE_DIR}`);
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
