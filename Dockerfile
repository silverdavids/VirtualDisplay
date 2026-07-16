FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG REACT_APP_VIRTUAL_API_BASE_URL=http://localhost:3000
ARG REACT_APP_VIRTUAL_TICKETS_API=http://127.0.0.1:5088
ARG REACT_APP_TERMINAL_CODE
ARG REACT_APP_DISPLAY_VERSION=1.0.0

ENV REACT_APP_VIRTUAL_API_BASE_URL=$REACT_APP_VIRTUAL_API_BASE_URL \
    REACT_APP_VIRTUAL_TICKETS_API=$REACT_APP_VIRTUAL_TICKETS_API \
    REACT_APP_TERMINAL_CODE=$REACT_APP_TERMINAL_CODE \
    REACT_APP_DISPLAY_VERSION=$REACT_APP_DISPLAY_VERSION

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

