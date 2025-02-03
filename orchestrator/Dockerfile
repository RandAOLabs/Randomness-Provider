# Use the official lightweight Node.js image
FROM node:20-bullseye-slim

# Create a working directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies including dev dependencies (TypeScript)
RUN npm install

# Copy the source files
COPY . .

# Compile TypeScript code
RUN npx tsc

# Expose the app port
EXPOSE 3000

# Run the app
CMD ["node", "dist/app.js"]
