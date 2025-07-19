FROM node:18-slim

# Switch to the node user
USER node

# Set environment variables for the user
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH \
    NODE_ENV=production

# Set the working directory
WORKDIR $HOME/app

# Copy the package.json and package-lock.json files to the working directory
COPY --chown=node:node package*.json ./

# Install Node.js dependencies
RUN npm install --legacy-peer-deps

# Copy the application code to the working directory
COPY --chown=node:node . .

# Ensure the ownership of the directory to the node user
RUN chown -R node:node .

# Expose the port the app runs on
EXPOSE 7860

# Command to run the Node.js server a
CMD ["node", "server.js"]
