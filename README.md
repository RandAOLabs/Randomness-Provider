# Node Provider Setup Guide

Welcome to the Node Provider Setup Guide for our software. This document will help you deploy and maintain a node with guaranteed 100% uptime, ensuring optimal network performance and compliance.

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

This guide will help you set up and manage your node efficiently.

---

## Hardware Requirements
To run a node, the following hardware specifications are required:

- **Minimum Hardware Requirements:**
  - 4 GB memory
  - 2 CPU cores
- **Recommended Deployment:** Access to an AWS account (we handle the configuration)
- **Note:** These requirements will increase over time to meet network demands.

---

## Deployment Options

### Option 1: AWS Deployment with Terraform
This is the recommended method, providing the best performance and uptime at the lowest cost.

[TerraForm setup](./terraform/README.md)



### Option 2: Virtual Machine Deployment with Docker Compose
This option may cost more and depends on the uptime of the hardware you use. It is not recommended for long-term or high-performance node operators.

[Docker-compose setup](./docker-compose/README.md)


## Graceful Shutdown Policy
To avoid being slashed, it is critical to run the graceful shutdown script in the event of downtime. Failing to do so may result in penalties.

Ensure that your monitoring and alert systems are set up to notify you immediately of any issues.

TODO

---


## Staking

After successfully setting up your node, you will need to provide proof that the gateway is operational.

1. Show logs from the node setup to Ethan for verification.

2. Upon confirmation, Ethan will provide your provider address with the necessary funds.

3. Navigate to [Insert link here] to stake your funds and configure your provider information.

By completing this process, you will fully activate your node and ensure it is ready for network participation.
Thank you for contributing to the network's success!