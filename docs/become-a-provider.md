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

#### Steps to Deploy:
1. **Install Terraform:**  
   Follow the [official Terraform installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli).

2. **Configure AWS Environment Variables:**  
   Open a terminal and enter the following commands:
   ```bash
   export AWS_ACCESS_KEY_ID="your-access-key-id"
   export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
   export AWS_REGION="your-region"  # e.g., us-east-1
   ```

3. **Initialize and Apply Terraform Configuration:**
   Navigate to the Terraform directory of the project and run:
   ```bash
   terraform init
   terraform apply
   ```
   Type `yes` when prompted to confirm.

This setup ensures your node is deployed with the highest uptime and optimal performance.

### Option 2: Virtual Machine Deployment with Docker Compose
This option may cost more and depends on the uptime of the hardware you use. It is not recommended for long-term or high-performance node operators.

#### Steps to Deploy:
1. **Install Docker Compose:**  
   Follow the [official Docker Compose installation guide](https://docs.docker.com/compose/install/).

2. **Deploy Node:**
   Navigate to the Docker Compose directory and run:
   ```bash
   docker-compose up -d
   ```

This setup will work but may not guarantee the same performance or reliability as the AWS-based deployment.

---

## Graceful Shutdown Policy
To avoid being slashed, it is critical to run the graceful shutdown script in the event of downtime. Failing to do so may result in penalties.

Ensure that your monitoring and alert systems are set up to notify you immediately of any issues.

---

By following this guide, you can successfully deploy and maintain a node with optimal uptime and performance. Thank you for contributing to the network's success!

