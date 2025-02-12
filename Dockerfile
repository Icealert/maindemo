# Use Node.js LTS version with smaller base image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies with production only and clean npm cache
RUN npm ci --only=production && npm cache clean --force

# Copy app source
COPY . .

# Expose port
EXPOSE 8080

# Set default environment variables and memory limits
ENV NODE_ENV=production \
    PORT=8080 \
    NODE_OPTIONS="--max-old-space-size=256 --optimize-for-size --gc-interval=100 --max-semi-space-size=2"

# Start the app with garbage collection and memory optimization flags
CMD ["node", "--expose-gc", "--optimize-for-size", "--max-old-space-size=256", "--gc-interval=100", "--max-semi-space-size=2", "server.js"]