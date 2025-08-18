#!/bin/bash -e

# Export version as an environment variable
export VERSION=v1.0.20  # You can change this value to any version you want

# Build the Docker image with the version tag
docker build -t randao/orchestrator:latest -t randao/orchestrator:$VERSION .

# Log in to Docker
docker login

# Push the image with the version tag
docker push randao/orchestrator:latest
docker push randao/orchestrator:$VERSION

# Create and use buildx builder
docker buildx create --use
docker buildx inspect --bootstrap

# Build the multi-platform image and push it
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
-t randao/orchestrator:latest \
-t randao/orchestrator:$VERSION \
--push .