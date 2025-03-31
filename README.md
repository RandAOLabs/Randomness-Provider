# Node Provider Setup Guide

This guide will walk you through getting your randomness provider set up and connected to the network so you can start contributing to the protocol and participating in decentralized randomness!

## Table of Contents
1. [Introduction](#introduction)
2. [Hardware Requirements](#hardware-requirements)
3. [Randomness Generation](#randomness-generation)
4. [Deployment Options](#deployment-options)
   - [Option 1: AWS Deployment with Terraform](#option-1-aws-deployment-with-terraform)
   - [Option 2: Docker Compose Deployment](#option-2-docker-compose-deployment)
5. [Graceful Shutdown Policy](#graceful-shutdown-policy)
6. [Staking](#staking)

---

## Introduction
As a node provider, you are responsible for ensuring 100% uptime. In the event of necessary downtime, it is mandatory to run the graceful shutdown process to prevent being slashed.

Your provider performs 3 main functions:
1. It updates the amount of available random it has stored on chain. Each random value requires significant computation to create, ensuring compliance with our commit-reveal time delay scheme.
2. It detects when someone has requested random from you and provides the input number to your time delay function. This is not the final random number.
3. It detects when all parties have submitted their input numbers and then provides the output number along with the proof of history checkpoints to the chain for verification. This output is the random number that will be used on chain.

These steps are executed as quickly as possible to get the complete random value on chain promptly. Faster providers will be incentivized for their speed, while slower ones will be penalized. If a provider is too slow for step 2, it will be slashed a small amount. If a provider is too slow for step 3, they will be considered malicious and slashed heavily.

If you need to take your provider offline, you must run the graceful shutdown process, which will execute step 1 once with a value of -1, indicating you are no longer offering random. After that, your node will finish all pending requests in steps 2 and 3 before shutting down.

---

## Hardware Requirements
To run a node, the following hardware specifications are required:

- **Minimum Hardware Requirements:**
  - 4 GB memory
  - 2 CPU cores
- **Note:** These requirements will increase over time to meet network demands.

---

## Randomness Generation

Our system now uses cryptographic time lock puzzles instead of Verifiable Delay Functions (VDF) for randomness generation. The provider "mines" for these puzzles, which creates a provable time delay between commitment and revelation of random values. This approach enhances security while maintaining verifiability of the randomness generated.

The time lock puzzles require significant initial computation but become less resource-intensive once you've mined and stored a sufficient number of them for sale. This makes the provider more efficient over time as your puzzle inventory grows.

---

## What the Hardware Runs
The hardware you set up runs 3 key services:
1. A provider service
2. A database for the provider
3. Temporary jobs to generate random values and store them in the database

Both of our deployment options are designed to run these services efficiently.

---

## Deployment Options

We now fully support and recommend two deployment methods, depending on your infrastructure preferences and capabilities:

### Option 1: AWS Deployment with Terraform
This method leverages AWS services for optimal performance, scalability, and cost-effectiveness.

**Advantages:**
- Most cost-effective solution at scale
- Guaranteed 100% uptime with AWS reliability
- Optimized for performance with managed services
- Automatic scaling based on demand

While this option may be more technically complex to set up initially, it provides the best long-term solution for dedicated providers.

[Terraform setup guide](./terraform/README.md)

### Option 2: Docker Compose Deployment
This method allows you to run the provider on your own hardware using Docker containers.

**Advantages:**
- Easier to set up if you have spare hardware available
- More straightforward for users familiar with Docker
- Direct control over your infrastructure
- Simpler technical requirements

This option is less resource-intensive once you've mined enough time lock puzzles and stored them for sale.

[Docker Compose setup guide](./docker-compose/README.md)

Both methods are fully supported and recommended as long as you can ensure 100% uptime or follow the graceful shutdown procedure during maintenance periods.

---

## Graceful Shutdown Policy
To avoid being slashed, it is critical to run the graceful shutdown in the event of planned downtime. Failing to do so may result in penalties.

To run a graceful shutdown:
1. Go to ar://randao
2. Navigate to your node
3. Select the "SHUT DOWN" button and sign the transaction

This will tell your provider to stop serving random values.

After maintenance is complete and your provider is back online:
1. Click the "START UP" button
2. This will signal your provider to resume serving random values

---

## Staking

After successfully setting up your node, you will need to provide proof that the gateway is operational:

1. Show logs from the node setup to Ethan for verification.
2. Upon confirmation, Ethan will provide your provider address with the necessary funds.
3. Navigate to ar://randao to stake your funds and configure your provider information.

By completing this process, you will fully activate your node and ensure it is ready for network participation.

Thank you for contributing to the network's success!
