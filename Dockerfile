FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server ./server
COPY public ./public
# o banco, os anexos e os backups ficam aqui: monte um volume persistente neste caminho
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:3000/api/saude || exit 1
USER node
CMD ["node", "server/index.js"]
