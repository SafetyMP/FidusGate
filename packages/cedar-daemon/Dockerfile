# Multi-stage Docker build for high-performance Rust-native Cedar Daemon
FROM rust:slim AS builder
WORKDIR /usr/src/cedar-daemon

# Copy cargo manifest and sources from workspace context
COPY packages/cedar-daemon/Cargo.toml ./
COPY packages/cedar-daemon/src ./src

# Build for release
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /usr/src/cedar-daemon/target/release/cedar-daemon /app/cedar-daemon

# Copy policy.cedar from the workspace root context
COPY policy.cedar /app/policy.cedar

EXPOSE 50051
CMD ["/app/cedar-daemon"]
