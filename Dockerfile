FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/prevoir.db
VOLUME /data
EXPOSE 3000
CMD ["node", "start.js"]
