# Wallet Address Generation

This guide explains how to generate an Arweave wallet address from a 12-word mnemonic phrase.

## Prerequisites

After cloning the repository, make sure to install dependencies:

```bash
cd orchestrator
npm install
```

## Usage Methods

### Method 1: Standalone JavaScript (Most Reliable)

```bash
npm run wallet-address "your 12 word mnemonic phrase here"
```

This uses the `wallet-standalone.js` file which has better module resolution.

### Method 2: TypeScript version

```bash
npm run wallet-address-ts "your 12 word mnemonic phrase here"
```

### Method 3: Alternative TypeScript execution

```bash
npm run wallet-address-alt "your 12 word mnemonic phrase here"
```

### Method 4: Compiled JavaScript

First, build the project:
```bash
npm run build
```

Then run:
```bash
npm run wallet-address-js "your 12 word mnemonic phrase here"
```

## Example

```bash
npm run wallet-address "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
```

This will output the corresponding Arweave wallet address.

## Troubleshooting

If you get module resolution errors on remote machines:

1. **Use Method 1** (standalone JavaScript) - this is most reliable across different environments
2. Make sure you've run `npm install` in the orchestrator directory
3. Check that Node.js version is compatible (Node 16+ recommended)
4. If still having issues, try Method 4 (compiled JavaScript)

The script validates mnemonic phrases and supports 12, 18, or 24-word phrases.

## Direct Execution

You can also run the standalone script directly:

```bash
node wallet-standalone.js "your 12 word mnemonic phrase here"
```
