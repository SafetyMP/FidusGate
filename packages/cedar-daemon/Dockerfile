# Multi-stage Docker build for high-performance Rust-native Cedar Daemon
FROM rust:slim@sha256:34fb2f168c432d421a09883c663b275b33cbb30f6b18642fbd09a684c6546d0e AS builder
WORKDIR /usr/src/cedar-daemon

# Copy cargo manifest and sources from workspace context
COPY packages/cedar-daemon/Cargo.toml ./
COPY packages/cedar-daemon/src ./src

# Build for release
RUN cargo build --release

FROM debian:bookworm-slim@sha256:7b140f374b289a7c2befc338f42ebe6441b7ea838a042bbd5acbfca6ec875818
WORKDIR /app
COPY --from=builder /usr/src/cedar-daemon/target/release/cedar-daemon /app/cedar-daemon

# Copy policy.cedar and policy.cedarschema from the workspace root context
COPY policy.cedar /app/policy.cedar
COPY policy.cedarschema /app/policy.cedarschema

EXPOSE 50051
CMD ["/app/cedar-daemon"]
