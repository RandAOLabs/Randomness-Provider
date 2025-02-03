To build:

Save all files
Run:
docker build -t randao/orchestrator:latest -t randao/orchestrator:v0.1.10 .

docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)

npx ts-node src/clear_outputs.ts