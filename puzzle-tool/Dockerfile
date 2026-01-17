# Use an official Python image as a base
FROM python:3.12

# Install system dependencies needed for gmpy2 and PostgreSQL connection
RUN apt-get update && apt-get install -y \
    libgmp-dev \
    libmpfr-dev \
    libmpc-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set up a working directory
WORKDIR /app

# Copy only the requirements file to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Set environment variables for PostgreSQL credentials (can be overridden at runtime)
ENV DB_NAME=mydatabase \
    DB_USER=myuser \
    DB_PASSWORD=mypassword \
    DB_HOST=localhost \
    DB_PORT=5432

# Expose any necessary ports (optional, specify if your app uses specific ports)
# EXPOSE 8000

# Default command to run the generation script
# Override with: docker run <image> python solve.py <args>
# Or: docker run <image> python test.py
CMD ["python", "generate.py", "1"]
