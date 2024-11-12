cd into repo

docker login
docker build -t satoshispalace/orchestrator:latest -t satoshispalace/orchestrator:v0.0.30 .
docker push satoshispalace/orchestrator:v0.0.30
docker push satoshispalace/orchestrator:latest
