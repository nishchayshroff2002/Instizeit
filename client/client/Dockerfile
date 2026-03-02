FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV VITE_ALLOW_EXTERNAL=true
ENV __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=all
EXPOSE 4173
CMD npx vite preview --host 0.0.0.0 --port $PORT