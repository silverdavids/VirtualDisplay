FROM node:20-alpine AS build

ARG BUILD_SHA=unknown

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG REACT_APP_TERMINAL_CODE=DISPLAY-001
ARG REACT_APP_DISPLAY_VERSION=1.0.0
ARG REACT_APP_BUILD_SHA=$BUILD_SHA

ENV REACT_APP_TERMINAL_CODE=$REACT_APP_TERMINAL_CODE \
    REACT_APP_DISPLAY_VERSION=$REACT_APP_DISPLAY_VERSION \
    REACT_APP_BUILD_SHA=$REACT_APP_BUILD_SHA

RUN npm run build

FROM nginx:1.27-alpine

ARG BUILD_SHA=unknown
ARG REPOSITORY_URL=unknown

LABEL org.opencontainers.image.revision=$BUILD_SHA \
      org.opencontainers.image.source=$REPOSITORY_URL

ENV VIRTUAL_DISPLAY_BUILD_SHA=$BUILD_SHA

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/env.template.js /etc/nginx/templates/env.template.js
COPY docker/build-info.template.json /etc/nginx/templates/build-info.template.json
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["/bin/sh", "-c", "envsubst < /etc/nginx/templates/env.template.js > /usr/share/nginx/html/env.js && envsubst < /etc/nginx/templates/build-info.template.json > /usr/share/nginx/html/build-info.json && exec nginx -g 'daemon off;'"]
