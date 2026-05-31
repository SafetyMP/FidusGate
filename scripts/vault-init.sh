#!/bin/bash
echo "🔑 Initializing Vault Transit Secrets Engine..."

until curl -s http://localhost:8200/v1/sys/health &>/dev/null; do
  echo "⌛ Waiting for Vault to start..."
  sleep 1
done

docker exec -e VAULT_TOKEN=root fidusgate-vault vault secrets enable transit
docker exec -e VAULT_TOKEN=root fidusgate-vault vault write -f transit/keys/fidusgate-key type=ed25519
echo "✅ Vault HSM initialized with Ed25519 transit key!"
