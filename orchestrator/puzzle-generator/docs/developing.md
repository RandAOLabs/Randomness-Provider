# Project Setup
This guide will walk you through setting up and running the Time lock puzzle project in Python.

## Prerequisites
 - Python 3.7+: Make sure you have Python installed on your system.
 - GMPY2: This library is required for high-performance modular arithmetic. It provides bindings to the GMP library for Python.

## Setting Up a Virtual Environment
It’s recommended to use a virtual environment to manage dependencies for this project.
1. Create the Virtual Environment:
```bash
python3 -m venv venv
```
2. Activate the Virtual Environment:
 - On macOS and Linux:
```bash
source venv/bin/activate
```
 - On Windows:
```bash
.\venv\Scripts\activate
```

## Install Dependencies:
```bash
pip install -r requirements.txt
```
Ensure that gmpy2 is installed. If you encounter issues, you may need to install GMP and MPFR on your system (e.g., sudo apt-get install libgmp-dev libmpfr-dev on Ubuntu).
```bash
sudo apt-get install libgmp-dev libmpfr-dev
```

## Initializing database
```bash
python src/database/initialize_db.py
```


## Running the Project
To generate a VDF proof and verify it, run the main.py script:
```bash
python main.py 10
```
Required Command line Arguments:
 - count: the number of time lock puzzles to generate and store in the database

## Running the Tests
To run the unit tests, use the following command:
```bash
pytest
```
With coverage:
```bash
pytest --cov=src
```






# Set version as an environment variable
export VERSION=v0.1.5  # Change this value as needed

# Initial build and tagging for local testing
docker build -t randao/puzzle-gen:latest -t randao/puzzle-gen:$VERSION .

# Log in to Docker Hub (optional, remove if already logged in)
docker login

# Push local builds
docker push randao/puzzle-gen:latest
docker push randao/puzzle-gen:$VERSION

# Set up and use Docker buildx builder (if not already created)
docker buildx create --name arm-builder --use || docker buildx use arm-builder
docker buildx inspect --bootstrap

# Multi-platform build for ARM64 and AMD64, and push to Docker Hub
docker buildx build --platform linux/amd64,linux/arm64 \
  -t randao/puzzle-gen:latest \
  -t randao/puzzle-gen:$VERSION \
  --push .
