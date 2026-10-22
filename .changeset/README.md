# Changesets

Every user-facing change adds a changeset: `pnpm changeset`, pick any `@bfhr/*` package and the bump, write one line for the release notes. All `@bfhr/*` packages form one `fixed` group, so the whole app shares one version `X.Y.Z`.

Merging to `main` opens or updates the "Version packages" pull request (`.github/workflows/version.yml`). Merging that pull request tags `vX.Y.Z`, creates the draft GitHub Release with these notes and starts `release.yml`. Process: [docs/runbooks/release.md](../docs/runbooks/release.md).
