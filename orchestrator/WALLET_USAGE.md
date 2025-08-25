# Wallet Address Generation

This guide explains how to generate an Arweave wallet address from a 12-word mnemonic phrase.

## Prerequisites

After cloning the repository, make sure to install dependencies:

```bash
cd orchestrator
npm install
```

## Usage Methods

### Method 1: Using npm script (Recommended)

```bash
npm run wallet-address "your 12 word mnemonic phrase here"
```

### Method 2: Using compiled JavaScript

First, build the project:
```bash
npm run build
```

Then run:
```bash
npm run wallet-address-js "your 12 word mnemonic phrase here"
```

### Method 3: Direct ts-node execution

```bash
npx ts-node src/walletUtils.ts "your 12 word mnemonic phrase here"
```

## Example

```bash
npm run wallet-address "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
```

This will output the corresponding Arweave wallet address.

## Troubleshooting

If you get module resolution errors:

1. Make sure you've run `npm install` in the orchestrator directory
2. Try using Method 2 (compiled JavaScript) instead
3. Ensure all dependencies are properly installed

The script validates mnemonic phrases and supports 12, 18, or 24-word phrases.
