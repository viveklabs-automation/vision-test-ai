# Use the official Microsoft Playwright environment as the base image
FROM mcr.microsoft.com/playwright:v1.45.0-noble

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all project source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Expose the dashboard port
EXPOSE 3000

# Set CI mode to force headless browser runs in the cloud
ENV CI=true
ENV PORT=3000

# Launch the Express dashboard server
CMD ["node", "dist/server.js"]
