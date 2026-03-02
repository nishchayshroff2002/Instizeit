FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY package*.json ./
RUN npm install
COPY . .
ENV VITE_SERVER_ADDRESS=https://instizeit-57888616595.europe-west1.run.app 
RUN npm run build
CMD ["sh", "-c", "serve -s dist -l $PORT"]