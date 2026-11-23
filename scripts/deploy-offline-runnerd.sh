#!/usr/bin/env bash
# Deploy Paperclip to a host that cannot compile the Runner inside the image.
#
# The remote checkout is a plain directory (not a git clone) and it carries
# host-local additions an ordinary sync would overwrite: `.npmrc`,
# `docker/docker-compose.override.yml`, `docker/.env`, `DEPLOYMENT-NOTES.md` and
# `vendor-bin/`. This script stages a fresh clone on the host, removes source
# files the target commit no longer has (renames and deletions otherwise leave
# stale modules that `tsc` still compiles), syncs from the staged clone, and
# rebuilds.
#
# Usage: scripts/deploy-offline-runnerd.sh [options]
#   --host <ssh-host>     SSH host alias        (default: $PAPERCLIP_DEPLOY_HOST or t207)
#   --remote-dir <path>   Remote checkout       (default: /opt/paperclip)
#   --branch <name>       Branch to deploy      (default: current local branch)
#   --repo-url <url>      Clone URL on the host (default: local `fork`, else `origin` remote)
#   --skip-runnerd        Do not rebuild or upload paperclip-runnerd
#   --skip-build          Sync only; do not build or restart
#   --skip-clone          Reuse the existing stage clone on the host (for when the
#                         host cannot reach the git remote); verifies its commit
#   --dry-run             Print the plan without changing anything
#   -h, --help            Show this help
#
# Nothing restarts until the image build succeeds, so a failed build leaves the
# running containers untouched.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${PAPERCLIP_DEPLOY_HOST:-t207}"
REMOTE_DIR="/opt/paperclip"
BRANCH=""
REPO_URL=""
SKIP_RUNNERD=0
SKIP_BUILD=0
SKIP_CLONE=0
DRY_RUN=0

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:?--host needs a value}"; shift 2 ;;
    --remote-dir) REMOTE_DIR="${2:?--remote-dir needs a value}"; shift 2 ;;
    --branch) BRANCH="${2:?--branch needs a value}"; shift 2 ;;
    --repo-url) REPO_URL="${2:?--repo-url needs a value}"; shift 2 ;;
    --skip-runnerd) SKIP_RUNNERD=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-clone) SKIP_CLONE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown option: $1" >&2; usage 1 ;;
  esac
done

cd "$REPO_ROOT"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
REPO_URL="${REPO_URL:-$(git remote get-url fork 2>/dev/null || git remote get-url origin)}"
HEAD_SHA="$(git rev-parse HEAD)"
STAGE_DIR="/tmp/paperclip-deploy-${BRANCH//\//-}"

remote_exec() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '  [dry-run] ssh %s: %s\n' "$HOST" "$1"
  else
    ssh -o BatchMode=yes "$HOST" "$1"
  fi
}

echo "==> deploy ${BRANCH} @ ${HEAD_SHA:0:12} -> ${HOST}:${REMOTE_DIR}"
echo "    repo: ${REPO_URL}"
echo "    stage: ${STAGE_DIR}"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "!! local tracked files are modified; the host deploys the cloned commit, not this tree" >&2
fi

if [ "$SKIP_CLONE" = "1" ]; then
  echo "==> 1/6 branch check skipped (--skip-clone); the staged clone is verified instead"
else
echo "==> 1/6 verify the branch is pushed"
set +e
remote_exec "git ls-remote --exit-code --heads '${REPO_URL}' '${BRANCH}' >/dev/null"
ls_remote_status=$?
set -e
if [ "$ls_remote_status" -ne 0 ]; then
  # git exits 2 when the ref is genuinely absent; anything else is transport.
  if [ "$ls_remote_status" -eq 2 ]; then
    echo "branch '${BRANCH}' not found at ${REPO_URL}; push it first" >&2
  else
    echo "could not read refs from ${REPO_URL} (git ls-remote exit ${ls_remote_status}); network or remote error, retry" >&2
  fi
  exit 1
fi
fi

if [ "$SKIP_RUNNERD" = "0" ]; then
  echo "==> 2/6 build paperclip-runnerd (release)"
  RUNNERD="$REPO_ROOT/packages/paperclip-runner/runner/target/release/paperclip-runnerd"
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] cargo build --release … -p paperclip-runner-core --bin paperclip-runnerd"
    echo "  [dry-run] rsync ${RUNNERD} ${HOST}:${REMOTE_DIR}/vendor-bin/paperclip-runnerd.new"
  else
    cargo build --release --manifest-path packages/paperclip-runner/runner/Cargo.toml \
      --locked -p paperclip-runner-core --bin paperclip-runnerd
    echo "    $(sha256sum "$RUNNERD" | cut -d' ' -f1)  $(stat -c%s "$RUNNERD") bytes"
    echo "==> 3/6 upload paperclip-runnerd"
    rsync -az "$RUNNERD" "${HOST}:${REMOTE_DIR}/vendor-bin/paperclip-runnerd.new"
    remote_exec "cd ${REMOTE_DIR}/vendor-bin && mv paperclip-runnerd.new paperclip-runnerd && chmod 0755 paperclip-runnerd"
  fi
else
  echo "==> 2/6 runnerd: skipped"
  echo "==> 3/6 runnerd: skipped"
fi

echo "==> 4/6 stage a fresh clone and drop source files this commit no longer has"
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] clone ${REPO_URL} (${BRANCH}) -> ${STAGE_DIR}; diff *.ts/*.tsx/*.mjs; rm stale"
else
  ssh -o BatchMode=yes "$HOST" STAGE_DIR="$STAGE_DIR" REMOTE_DIR="$REMOTE_DIR" REPO_URL="$REPO_URL" BRANCH="$BRANCH" DO_CLONE="$([ "$SKIP_CLONE" = "1" ] && echo 0 || echo 1)" EXPECTED_SHA="$HEAD_SHA" 'bash -s' <<'REMOTE'
set -euo pipefail
if [ "$DO_CLONE" = "1" ]; then
  rm -rf "$STAGE_DIR"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$STAGE_DIR"
fi
staged_sha=$(git -C "$STAGE_DIR" rev-parse HEAD)
if [ "$staged_sha" != "$EXPECTED_SHA" ]; then
  echo "!! staged clone is at $staged_sha but this deploy targets $EXPECTED_SHA" >&2
  echo "   re-run without --skip-clone (or refresh the clone) " >&2
  exit 1
fi
echo "    staged: $(git -C "$STAGE_DIR" log --oneline -1)"

list_sources() {
  find "$1" \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \) \
    -not -path '*/node_modules/*' -not -path '*/dist/*' \
    -not -path '*/.codegraph/*' -not -path '*/provider-assets/*' \
    | sed "s|^$1||" | sort
}
list_sources "$STAGE_DIR" > /tmp/deploy-stage-files.txt
list_sources "$REMOTE_DIR" > /tmp/deploy-remote-files.txt
comm -23 /tmp/deploy-remote-files.txt /tmp/deploy-stage-files.txt > /tmp/deploy-stale-files.txt
echo "    stale source files: $(wc -l < /tmp/deploy-stale-files.txt)"
if [ -s /tmp/deploy-stale-files.txt ]; then
  sed "s|^|$REMOTE_DIR|" /tmp/deploy-stale-files.txt | xargs rm -f
fi
REMOTE
fi

echo "==> 5/6 sync the staged clone into ${REMOTE_DIR}"
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] ssh ${HOST}: rsync -a <excludes> ${STAGE_DIR}/ ${REMOTE_DIR}/"
  echo "  [dry-run] rsync docker/runner-package.t207.json -> ${REMOTE_DIR}/packages/paperclip-runner/package.json"
else
  ssh -o BatchMode=yes "$HOST" STAGE_DIR="$STAGE_DIR" REMOTE_DIR="$REMOTE_DIR" 'bash -s' <<'REMOTE'
set -euo pipefail
rsync -a \
  --exclude=.git --exclude=.npmrc --exclude=Dockerfile \
  --exclude=DEPLOYMENT-NOTES.md --exclude=docker/.env \
  --exclude=docker/docker-compose.override.yml --exclude=vendor-bin \
  --exclude='*.bak-*' --exclude=.claude --exclude=.codex --exclude=.devin \
  --exclude=.codegraph --exclude='*.scip' --exclude=node_modules \
  --exclude=dist --exclude=dist-runtime --exclude=target --exclude=provider-assets \
  "$STAGE_DIR/" "$REMOTE_DIR/"
REMOTE
  # Derive the host-local Runner manifest from the deployed commit. Keeping a
  # static copy in the repository drifts as soon as upstream bumps a dependency
  # (@openai/codex did), and a stale manifest fails the image's frozen-lockfile
  # check. Only the `build` script differs: it stages a prebuilt binary instead
  # of invoking cargo.
  MANIFEST="$REPO_ROOT/.git/runner-package.offline-runnerd.json"
  node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
// Upstream may route the binary step through build:binary or a helper script;
// both shapes end up compiling cargo unless the host-local copy is adjusted.
// Only this copy changes, and the image build does not run the repository
// release tests that assert cargo sits in build:binary.
const stageOnly = "node scripts/stage-runner-binary.mjs";
const binaryScript = pkg.scripts["build:binary"];
const build = pkg.scripts.build;
if (typeof binaryScript === "string" && binaryScript.includes("cargo")) {
  pkg.scripts["build:binary"] = stageOnly;
} else if (typeof build === "string" && build.includes("pnpm run build:binary")) {
  pkg.scripts.build = build.replace("pnpm run build:binary", stageOnly);
} else {
  console.error("could not find the cargo step in packages/paperclip-runner/package.json; update scripts/deploy-offline-runnerd.sh");
  process.exit(1);
}
fs.writeFileSync(process.argv[2], JSON.stringify(pkg, null, 2) + "\n");
' "$REPO_ROOT/packages/paperclip-runner/package.json" "$MANIFEST"
  rsync -az "$MANIFEST" "${HOST}:${REMOTE_DIR}/packages/paperclip-runner/package.json"
fi

if [ "$SKIP_BUILD" = "1" ]; then
  echo "==> 6/6 build: skipped (sync only)"
  exit 0
fi

echo "==> 6/6 build and restart"
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] ssh ${HOST}: docker compose build server && up -d && health check"
  exit 0
fi
ssh -o BatchMode=yes "$HOST" REMOTE_DIR="$REMOTE_DIR" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR/docker"
files="-f docker-compose.yml"
[ -f docker-compose.override.yml ] && files="$files -f docker-compose.override.yml"
if [ -f docker-compose.offline-runnerd.yml ]; then
  files="$files -f docker-compose.offline-runnerd.yml"
else
  echo "!! docker/docker-compose.offline-runnerd.yml is missing; sync the repo before building" >&2
  exit 1
fi
docker compose $files build server
docker compose $files up -d
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3100/api/health || true)
  if [ "$code" = "200" ]; then echo "    health: 200 after ${i} checks"; exit 0; fi
  sleep 5
done
echo "!! health check never returned 200" >&2
docker compose $files ps >&2
exit 1
REMOTE

echo "done"
