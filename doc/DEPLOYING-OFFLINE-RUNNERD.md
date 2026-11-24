# Deploying without compiling the Runner inside the image

The stock `Dockerfile` compiles `paperclip-runnerd` (Rust) in its
`runner-artifacts-*` stages, derives a runner image identity from those
artifacts, and makes the `build` stage verify that identity. That chain needs a
reachable crates.io mirror plus a working Rust toolchain inside the build
container.

On hosts where either is missing, use the offline-runnerd pair:

| File | Purpose |
| --- | --- |
| `docker/Dockerfile.offline-runnerd` | Drops every `runner-artifacts-*` stage, stages a prebuilt `vendor-bin/paperclip-runnerd` in `build`, and creates empty provider-pack directories so `production` still has copy targets. |
| `docker/docker-compose.offline-runnerd.yml` | Points the `server` build at that Dockerfile and builds with host networking. |
| host-local Runner manifest | `scripts/deploy-offline-runnerd.sh` derives it from the deployed commit's `packages/paperclip-runner/package.json` at deploy time: same file, except `build` runs `node scripts/stage-runner-binary.mjs` instead of `pnpm run build:binary`. Deriving it prevents drift — a static copy went stale when upstream bumped `@openai/codex` from 0.160.0 to 0.170.0 and the image then failed its frozen-lockfile check. |
| `scripts/deploy-offline-runnerd.sh` | Stages a clone on the host, removes stale sources, syncs, builds, restarts, health-checks. |

## Deploy

```sh
# builds paperclip-runnerd with the local toolchain, uploads it, syncs the
# branch, rebuilds the image, restarts the server, waits for /api/health
scripts/deploy-offline-runnerd.sh --host t207

# inspect the plan first
scripts/deploy-offline-runnerd.sh --host t207 --dry-run

# sync only (no cargo, no image build)
scripts/deploy-offline-runnerd.sh --host t207 --skip-runnerd --skip-build
```

Nothing restarts until the image build succeeds; a failed build leaves the
running containers untouched.

## Manual equivalent

```sh
# 1. runnerd from the local toolchain
cargo build --release --manifest-path packages/paperclip-runner/runner/Cargo.toml \
  --locked -p paperclip-runner-core --bin paperclip-runnerd

# 2. stage a clone on the host and remove sources the target commit dropped
ssh t207 'rm -rf /tmp/pc-src && git clone --depth 1 -b <branch> <repo> /tmp/pc-src'

# 3. sync, keeping host-local files
ssh t207 'rsync -a --exclude=.git --exclude=.npmrc --exclude=Dockerfile \
  --exclude=DEPLOYMENT-NOTES.md --exclude=docker/.env \
  --exclude=docker/docker-compose.override.yml --exclude=vendor-bin \
  --exclude="*.bak-*" --exclude=.claude --exclude=.codex --exclude=.devin \
  --exclude=.codegraph --exclude="*.scip" --exclude=node_modules \
  --exclude=dist --exclude=dist-runtime --exclude=target --exclude=provider-assets \
  /tmp/pc-src/ /opt/paperclip/'

# 4. host-local Runner manifest and binary
# (the deploy script derives this from the deployed package.json; a hand copy must
#  also swap `pnpm run build:binary` for `node scripts/stage-runner-binary.mjs`)
rsync -az packages/paperclip-runner/runner/target/release/paperclip-runnerd \
  t207:/opt/paperclip/vendor-bin/paperclip-runnerd

# 5. build and restart
ssh t207 'cd /opt/paperclip/docker && docker compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.offline-runnerd.yml \
  build server && docker compose \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.offline-runnerd.yml up -d'
```

## Stale sources are the trap

A plain `rsync` without `--delete` keeps files the target commit renamed or
removed. `tsc` compiles them, and they fail against current types. The staging
step therefore deletes any `.ts` / `.tsx` / `.mjs` file that exists in the remote
checkout but not in the clone, ignoring `node_modules`, `dist`, `.codegraph` and
`provider-assets`. Do not widen that to a blanket `--delete`: the host also holds
host-local files and downloaded provider assets the clone never contains.

## Host requirements

- Container DNS must resolve the hosts the build talks to. If the Docker daemon
  forwards an IPv6-only nameserver and the build needs an IPv4 CDN, builds fail
  with `curl: (6) Could not resolve host`. `docker-compose.offline-runnerd.yml`
  builds with `network: host` for that reason.
- The npm registry must be reachable at a usable speed. The offline Dockerfile
  sets `npm_config_registry` to a mirror; adjust it if a different mirror is
  faster.
- The `build` stage keeps `PAPERCLIP_TSC_EMIT_ONLY=1` for the server build, which
  keeps the tsc step near 2.5 GiB instead of more than 10 GiB.

## No calls to the upstream service

The variant targets self-hosted and white-label hosts, so it turns off the two
paths that contact the upstream service on their own. Both live in
`docker/docker-compose.offline-runnerd.yml` and are overridable from
`docker/.env` or the shell:

| Variable | Default here | What it stops |
| --- | --- | --- |
| `PAPERCLIP_ANNOUNCEMENTS_ENABLED` | `false` | The announcement feed, which polls `pages.paperclip.ing/announcements/v1/current.json` on a timer and shows upstream product announcements in the board |
| `PAPERCLIP_TELEMETRY_DISABLED` | `1` | The server telemetry client, which otherwise defaults to enabled and posts the install id, version and workspace identity to `telemetry.paperclip.ing` |
| `DO_NOT_TRACK` | `1` | The same telemetry client, via the standard opt-out |

These stay on, and are not a leak:

- Sentry, which only sends once a DSN is configured (this variant sets none).
- Browser PostHog, which needs a token, a stack id and
  `PAPERCLIP_POSTHOG_BROWSER_ENABLED=1`; the `/_ph` proxy route is not mounted
  without them.
- The feedback share upload, which only runs when a user clicks share.
- GitHub, Slack, Teams, email and AI connection requests, which are the product's
  job and only fire for connections the operator configured.

To verify on a running host:

```sh
docker exec <server-container> sh -c 'tr "\0" "\n" < /proc/1/environ | grep -E "ANNOUNCE|TELEMETRY|DO_NOT_TRACK"'
ss -tnp | grep -E "paperclip\.ing|posthog|amazonaws"   # expect no rows
```

## Keeping the variant in sync with the stock Dockerfile

When the stock `Dockerfile` changes, review these six deltas and re-apply them,
then run `docker build --check -f docker/Dockerfile.offline-runnerd .`:

1. Delete every stage from `runner-artifacts-context` through
   `runner-artifacts` (and `COPY docker/tailscale.LICENSE`, which sits in the
   tailscale stage that this variant also drops).
2. In `build`, replace the three `runner-artifacts` references with
   `cp vendor-bin/paperclip-runnerd packages/paperclip-runner/runner/target/release/`
   plus `pnpm --filter @paperclipai/paperclip-runner build`.
3. Drop `check-runner-image-expectation.mjs`; no runner image identity exists.
4. Replace the `runner-provider-pack` body with `mkdir -p` for the three pack
   directories so `production` keeps its copy targets.
5. Add the npm registry `ENV` block to `base`.
6. Drop the `tailscale-client` stage and its two `COPY` lines plus the version
   check in `production` (the entrypoint does not use tailscaled).

Consequence to know about: the image ships no remote provider pack and no
tailscale, so remote OpenCode/ACPX runs and tailnet access are unavailable. Runs
that use a local model endpoint through the `llm-proxy` sidecar are unaffected.

## Pushing the result: watch the 100 MB limit

GitHub rejects a push whose history contains a blob over 100 MB (`pre-receive
hook declined`, with the reason usually cut off by a log tail). Tool output that
lives in the checkout root is the usual culprit: `index.scip` from a code index,
`.codegraph/**` caches, editor or agent notes.

If that happens before the push succeeds, do **not** rewrite published history:

```sh
# stop any partial index rewrite first; `git rm` on a 270k-file cache takes ~20 min
git reset 545c0d4c2f          # index back to the pre-merge commit; worktree untouched
printf '.codegraph/\n*.scip\n' >> .gitignore
git add -A                    # the ignored trees are now excluded
tree=$(git write-tree)
new=$(git commit-tree "$tree" -p <parent1> -p <parent2> -F message.txt)
git reset --soft "$new"
```

`git write-tree` + `git commit-tree` rebuilds the merge commit in O(1) instead of
deleting hundreds of thousands of index entries one by one. Verify before
pushing:

```sh
git ls-tree -r -l HEAD | awk '$4 > 5000000'    # expect empty
```

Ignore local tool output in `.gitignore` **before** the first `git add -A` of a
merge; these files are untracked, so an ignored pattern is enough.

## Rollback

Keep the previous image ID before deploying:

```sh
ssh t207 'docker inspect docker-server-1 --format "{{.Image}}"'
ssh t207 'cd /opt/paperclip/docker && docker tag <previous-image-id> docker-server:latest && docker compose up -d'
```
