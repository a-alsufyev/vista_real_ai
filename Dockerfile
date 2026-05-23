# ===== BUILD STAGE =====
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# фикс peer dependency конфликтов
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build


# ===== PRODUCTION STAGE =====
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# ВАЖНО: НЕ удаляем devDependencies, потому что vite нужен в runtime
RUN npm install --legacy-peer-deps

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["npm", "start"]
