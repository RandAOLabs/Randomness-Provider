To build:

Save all files
Run:
docker build -t randao/orchestrator:latest -t randao/orchestrator:v0.1.10 .

docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)

npx ts-node src/clear_outputs.ts








docker build -t randao/orchestrator:latest -t randao/orchestrator:v0.2.50 .

docker login

docker push randao/orchestrator:latest
docker push randao/orchestrator:v0.2.50


docker buildx create --use
docker buildx inspect --bootstrap


docker buildx build --platform linux/amd64,linux/arm64 \
-t randao/orchestrator:latest \
-t randao/orchestrator:v0.2.50 \
--push .
