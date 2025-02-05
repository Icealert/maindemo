# Use Node.js LTS version
FROM node:16-alpine

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

# Start the app with environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Use environment variables from Railway
CMD ["node", "server.js"]