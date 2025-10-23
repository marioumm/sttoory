# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# If building a NestJS app, make sure to build it
RUN npm run build

# Run the application
CMD ["npm", "run", "start:prod"]
