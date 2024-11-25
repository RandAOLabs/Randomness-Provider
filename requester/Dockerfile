# Use the official Node.js image as the base image
FROM node:20

# Create and set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire project into the container
COPY . .

# Compile TypeScript to JavaScript
RUN npx tsc

# Expose the port if needed
EXPOSE 3000

# Run the compiled app
CMD ["node", "dist/app.js"]
