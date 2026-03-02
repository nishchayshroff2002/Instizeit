FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4173
RUN VITE_SERVER_ADDRESS=https://instizeit-57888616595.europe-west1.run.app npm run build
CMD npx vite preview --host 0.0.0.0 --port $PORT