# Use Node.js LTS version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Expose port
EXPOSE 8080

# Set default environment variables
ENV NODE_ENV=production \
    PORT=8080

# Start the app
CMD ["node", "--max-old-space-size=512", "server.js"]