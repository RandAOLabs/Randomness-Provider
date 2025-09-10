#!/bin/bash -e

# Check if images directory exists
if [ ! -d "images" ]; then
    echo "Error: images directory not found!"
    exit 1
fi

# Load the images if they exist
if [ -f "images/postgres-13-alpine.tar" ]; then
    echo "Loading postgres image..."
    docker load < images/postgres-13-alpine.tar
else
    echo "Warning: postgres image archive not found"
fi

if [ -f "images/orchestrator-latest.tar" ]; then
    echo "Loading orchestrator image..."
    docker load < images/orchestrator-latest.tar
else
    echo "Warning: orchestrator image archive not found"
fi

echo "Image extraction complete"
