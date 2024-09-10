# Use the Bun base image or Node.js if Bun is not suitable
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Copy the entire application
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
