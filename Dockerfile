FROM node:24-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY data ./data
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.js"]
