To build:

Save all files
Run:
docker build -t randao/orchestrator:latest -t randao/orchestrator:v0.1.10 .

docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)

npx ts-node src/clear_outputs.ts



BUGS:
Random deletes itself from the db the moment its been used and not requested. It does not check if it has succeefully used it for challenge AND output first, just checks if its mapped it. This should not be  an issue since it waits a day buttttt you know should be fixed with a better check




# Export version as an environment variable
export VERSION=v1.0.6  # You can change this value to any version you want

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
