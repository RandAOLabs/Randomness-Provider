
# Navigate to your Docker Compose project directory (on your amd64 machine)
cd /path/to/your/local/RandaoProvider/docker-compose/

# Export version as an environment variable
export VERSION=v1.0.12  # You can change this value to any version you want

# Build the Docker image with the version tag
# docker build -t hottoddie/orchestrator:custom-file-wallet -t hottoddie/orchestrator:$VERSION .

# Log in to Docker
docker login

# Push the image with the version tag
docker push randao/orchestrator:latest
docker push randao/orchestrator:$VERSION

# Create and use buildx builder
docker buildx create --use
docker buildx inspect --bootstrap

<!-- # Build the multi-platform image and push it
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7,linux/riscv64 \
-t randao/orchestrator:latest \
-t randao/orchestrator:$VERSION \
--push . -->



# Build for multiple platforms (including amd64 for testing and arm64 for Orange Pi Zero 3)

  docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t hottoddie/orchestrator:custom-file-wallet \
  --push \
  -f ../orchestrator/Dockerfile \
  ../orchestrator/