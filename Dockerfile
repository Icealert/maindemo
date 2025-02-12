# Use Node.js LTS version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy app source
COPY . .

# Expose port
EXPOSE 8080

# Set default environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    NODE_OPTIONS="--max-old-space-size=256"

# Start the app with garbage collection options
CMD ["node", "--optimize-for-size", "--max-old-space-size=256", "--gc-interval=100", "server.js"]