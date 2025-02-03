# Node Provider Setup Guide

This guide will walk you through getting your randomness provider set up and connected to the network so you can start contributing to the protocal and participating in decentralized randomness!

## Table of Contents
1. [Introduction](#introduction)
2. [Hardware Requirements](#hardware-requirements)
3. [Deployment Options](#deployment-options)
   - [Option 1: AWS Deployment with Terraform](#option-1-aws-deployment-with-terraform)
   - [Option 2: Virtual Machine Deployment with Docker Compose](#option-2-virtual-machine-deployment-with-docker-compose)
4. [Graceful Shutdown Policy](#graceful-shutdown-policy)

---

## Introduction
As a node provider, you are responsible for ensuring 100% uptime. In the event of downtime, it is mandatory to run the graceful shutdown script to prevent being slashed.

Your provider does 3 main things.
1. It updates the amount of avalible random it has stored on chain. Each random takes a fair biot of compute to create so that it can be compliant to our commit reveal time delay scheme. 
2. It detects someone has requested random from you and it provides the input number to your time delay function. This is not the final random number.
3. It detects all parties have submited their input number and then it provides the output number as well as the proof of history checkpoints to the chain to be verified. This output is the random number that will be used on chain. 

It will do these three steps as fast as it can inorder to get the complete random on chain as quickly as possible. Faster providers will be incentivised for their speed and slower ones will been penalized. If a provider is too slow for step 2 it will be slashed a small amount. If a provider is too slow for step 3 they will be considered malicious and slashed heavily.

In the event you need to take your provider offline you must run the gracefull shutdown which will run step 1 once with a value of -1 indicating you are no longer offering random. After that your node will finish all requests in step 2 and 3 then turn off.

---

## Hardware Requirements
To run a node, the following hardware specifications are required:

- **Minimum Hardware Requirements:**
  - 4 GB memory
  - 2 CPU cores
- **Recommended Deployment:** Access to an AWS account (we handle the configuration)
- **Note:** These requirements will increase over time to meet network demands.

---


## What the hardware runs
The hardware you stand up runs 3 services. It stands up a provider. A database for the provider and it spins up temporary jobs to generate random and store it in the database.
In AWS the cheapest and highest performance solution is used for each of these. when running with docekr compose your machinbe will run each of these services itself in a containerized environment. Quick and scalable but not as cheap or efficient as the AWS solution.


## Deployment Options

### Option 1: AWS Deployment with Terraform
This is the recommended method, providing the best performance and uptime at the lowest cost.

[TerraForm setup](./terraform/README.md)


### Option 2: Virtual Machine Deployment with Docker Compose
This option may cost more and depends on the uptime of the hardware you use. It is not recommended for long-term or high-performance node operators.

[Docker-compose setup](./docker-compose/README.md)


## Graceful Shutdown Policy
To avoid being slashed, it is critical to run the graceful shutdown in the event of downtime. Failing to do so may result in penalties.

To run this go to ar://randao and navigate to your node and select the "SHUT DOWN" button and sign the transaction. 
This will tell your provider to stop serving random. 

After the maintinance is done and your provider is back up again click "START UP" button. 
This will tell your provider to start serving random. 

---


## Staking

After successfully setting up your node, you will need to provide proof that the gateway is operational.

1. Show logs from the node setup to Ethan for verification.

2. Upon confirmation, Ethan will provide your provider address with the necessary funds.

3. Navigate to ar://randao to stake your funds and configure your provider information.

By completing this process, you will fully activate your node and ensure it is ready for network participation.
Thank you for contributing to the network's success!