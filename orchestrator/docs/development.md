To build:

Save all files
Run:
docker build -t randao/orchestrator:latest -t randao/orchestrator:v0.1.10 .

docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)

npx ts-node src/clear_outputs.ts








# Export version as an environment variable
export VERSION=v0.3.85  # You can change this value to any version you want

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
docker buildx build --platform linux/amd64,linux/arm64 \
-t randao/orchestrator:latest \
-t randao/orchestrator:$VERSION \
--push .
