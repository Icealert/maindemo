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

# Create .env file from environment variables if not exists
RUN echo "PORT=\${PORT}" >> .env
RUN echo "CLIENT_ID=\${CLIENT_ID}" >> .env
RUN echo "CLIENT_SECRET=\${CLIENT_SECRET}" >> .env

# Expose port
EXPOSE 3000

# Start the app
CMD [ "npm", "start" ]