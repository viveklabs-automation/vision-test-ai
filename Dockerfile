# Use the official Microsoft Playwright environment as the base image
FROM mcr.microsoft.com/playwright:v1.45.0-noble

# Set environment to non-interactive during build
ENV DEBIAN_FRONTEND=noninteractive

# Install Xvfb, Fluxbox window manager, x11vnc server, noVNC, and websockify
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

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

# Make the entrypoint script executable
RUN chmod +x entrypoint.sh

# Expose the dashboard port
EXPOSE 3000

# Set environment variables
ENV CI=true
ENV PORT=3000
ENV DISPLAY=:99

# Launch the Express server directly
CMD ["node", "dist/server.js"]
