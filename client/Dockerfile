FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig*.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80 3000

# Simple nginx reverse proxy config
RUN echo 'server { \
    listen 3000; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://backend:4000/api/; \
    } \
    location /socket.io/ { \
        proxy_pass http://backend:4000/socket.io/; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "Upgrade"; \
    } \
}' > /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]
