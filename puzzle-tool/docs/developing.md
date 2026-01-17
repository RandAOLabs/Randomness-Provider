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

### Generate Puzzles
To generate time lock puzzles and store them in the database:
```bash
python generate.py 10
```
Required Command line Arguments:
 - count: the number of time lock puzzles to generate and store in the database

### Solve Puzzles
To solve a puzzle using sequential squaring (without private key):
```bash
python solve.py <x_hex> <t> <N_hex>
```

### Test Harness
To run the test harness:
```bash
python test.py
```
This will generate 1 puzzle and solve it both with and without the private key to verify correctness.

## Running the Tests
To run the unit tests, use the following command:
```bash
pytest
```
With coverage:
```bash
pytest --cov=src
```






## Building and Pushing Docker Image

# Export version as an environment variable
export VERSION=v0.1.7  # You can change this value to any version you want

# Build the Docker image with the version tag
docker build -t randao/puzzle-tool:latest -t randao/puzzle-tool:$VERSION .

# Log in to Docker Hub (if not already logged in)
docker login

# Push both tags to Docker Hub
docker push randao/puzzle-tool:latest
docker push randao/puzzle-tool:$VERSION

# (Optional) Multi-platform build for ARM64 and AMD64
# Set up and use Docker buildx builder (if not already created)
docker buildx create --name arm-builder --use || docker buildx use arm-builder
docker buildx inspect --bootstrap

# Multi-platform build and push to Docker Hub
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t randao/puzzle-tool:latest \
  -t randao/puzzle-tool:$VERSION \
  --push .
