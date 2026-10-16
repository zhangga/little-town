ARG GO_IMAGE=golang:1.25-alpine
FROM ${GO_IMAGE} AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/import ./cmd/import \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/push ./cmd/push \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./cmd/healthcheck

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && mkdir -p /app/logs /app/uploads \
    && chown -R 10001:10001 /app
WORKDIR /app
COPY --from=build /out/ /app/
COPY data/ /app/data/
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
# 保留当前微信云托管 Go 模板使用的 80 端口；自建 Compose 覆盖为 8080。
ENV ENV=production DEPLOY_TARGET=cloudrun PORT=80 \
    TZ=Asia/Shanghai APP_TIMEZONE=Asia/Shanghai \
    LOG_TO_FILE=false PUSH_ENABLED=false INIT_DATA=false
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD ["/app/healthcheck"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/server"]
