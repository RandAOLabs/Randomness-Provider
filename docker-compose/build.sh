#!/bin/bash -e

# Create images directory if it doesn't exist
mkdir -p images

# Export version as an environment variable
export VERSION=v1.0.20  # You can change this value to any version you want

# Build the Docker image with the version tag
cd ../orchestrator
docker build -t randao/orchestrator:latest -t randao/orchestrator:$VERSION .
cd ../docker-compose

# Create and use buildx builder
docker buildx create --use
docker buildx inspect --bootstrap

# Build the multi-platform image
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
-t randao/orchestrator:latest \
-t randao/orchestrator:$VERSION \
--load ../orchestrator

# Save the images
echo "Saving images to images directory..."
docker save postgres:13-alpine > images/postgres-13-alpine.tar
docker save randao/orchestrator:latest > images/orchestrator-latest.tar

echo "Build and packaging complete. Images saved to images directory."
