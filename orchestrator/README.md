cd into repo

docker login
docker build -t randao/orchestrator:latest -t randao/orchestrator:v0.1.4 .
docker push satoshispalace/orchestrator:v0.1.4
docker push satoshispalace/orchestrator:latest
