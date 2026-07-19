# False-green checklist (compose profile)

- Do not run `docker compose up`, smoke, or integration scripts from agent worktree cwd (`.worktrees/`).
- Parent merges on main root, rebuilds stack, runs smoke from repo root.
- Child green in worktree does not imply main-stack green.
- See `extensions.compose.deny_compose_from_worktree` in `.harness/profile.yaml`.
