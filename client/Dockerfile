# Build stage — Node 22 compiles the Angular app.
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage — nginx serves the static bundle and reverse-proxies /api/*.
FROM nginx:alpine
COPY --from=build /app/dist/client/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
