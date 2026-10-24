#!/bin/bash
# Code-only delivery. Default push/pull are dry-run. Production data never rides with code.
# Usage: bash scripts/deploy-vultr.sh push [--execute]
# VPS must explicitly select CONFIG_SOURCE_MODE=local; old .pending must be reconciled manually.
set -euo pipefail
DEPLOY_TARGET=${VULTR_HOST:-root@149.28.89.105}
DEPLOY_REMOTE=/opt/invest-platform
DEPLOY_ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEPLOY_LOCAL="$DEPLOY_ROOT/investment-platform"
DEPLOY_NODE=${NODE_BIN:-node}
code_files=(server.js cloud-store.js config-service.js decision-preview.js research-supplement.js package.json public/index.html public/investment-core.js public/research-supplement.json public/research/ public/repricing/)
case "${1:-}" in
  push)
    "$DEPLOY_NODE" "$DEPLOY_ROOT/scripts/test-offline.js"
    if [[ "${2:-}" != --execute ]]; then
      printf 'DRY RUN: code-only release to %s:%s\n' "$DEPLOY_TARGET" "$DEPLOY_REMOTE"
      printf '  %s\n' "${code_files[@]}"
      printf 'No network, restart or production write. After release authorization, repeat with --execute.\n'
      exit 0
    fi
    if [[ -n "$(git -C "$DEPLOY_ROOT" status --porcelain)" ]]; then
      printf 'Refusing release from a dirty checkout. Commit and push the reviewed delivery first.\n' >&2; exit 1
    fi
    deploy_commit=$(git -C "$DEPLOY_ROOT" rev-parse HEAD)
    deploy_branch=$(git -C "$DEPLOY_ROOT" branch --show-current)
    remote_commit=$(git -C "$DEPLOY_ROOT" ls-remote origin "refs/heads/$deploy_branch" | cut -f1)
    [[ "$deploy_commit" == "$remote_commit" ]] || { printf 'Reviewed commit is not pushed.\n' >&2; exit 1; }
    deploy_gh=${GH_BIN:-gh}
    if ! successful_checks=$("$deploy_gh" run list --repo jimislg/touzi1000 --commit "$deploy_commit" --workflow investor-safety.yml --json status,conclusion --jq 'map(select(.status == "completed" and .conclusion == "success")) | length'); then
      printf 'STOP: Cannot verify CI (.github/workflows/investor-safety.yml); it must pass for this exact commit before release.\n' >&2; exit 1
    fi
    [[ "$successful_checks" -gt 0 ]] || { printf 'CI safety workflow has not passed for this exact commit.\n' >&2; exit 1; }
    # Do not print service environment (it can contain credentials).
    ssh -o BatchMode=yes "$DEPLOY_TARGET" bash -s -- "$DEPLOY_REMOTE" <<'REMOTE'
set -euo pipefail
release_dir=$1
[[ ! -e "$release_dir/config.json.pending" ]] || { echo 'STOP: pending journal preserved; reconcile manually before release.' >&2; exit 1; }
service_env=$(systemctl show invest-platform --property=Environment --value)
case " $service_env " in *' CONFIG_SOURCE_MODE=local '*) ;; *) echo 'STOP: explicitly configure CONFIG_SOURCE_MODE=local before code release.' >&2; exit 1;; esac
backup_dir="$release_dir/code-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup_dir"
for file in server.js cloud-store.js config-service.js decision-preview.js research-supplement.js package.json; do
  [[ ! -f "$release_dir/$file" ]] || cp -p "$release_dir/$file" "$backup_dir/"
done
cp -Rp "$release_dir/public" "$backup_dir/public"
echo "Code rollback backup: $backup_dir (account data unchanged)"
REMOTE
    (cd "$DEPLOY_LOCAL" && rsync -azR -e 'ssh -o BatchMode=yes' "${code_files[@]}" "$DEPLOY_TARGET:$DEPLOY_REMOTE/")
    ssh -o BatchMode=yes "$DEPLOY_TARGET" 'systemctl restart invest-platform && systemctl is-active invest-platform'
    printf 'Released code commit %s. Verify authenticated data revision and both clients before completion.\n' "$deploy_commit"
    ;;
  pull)
    if [[ "${2:-}" != --execute ]]; then
      printf 'DRY RUN: read remote config into local archive only when explicitly repeated with --execute.\n'; exit 0
    fi
    git -C "$DEPLOY_ROOT" diff --quiet -- investment-platform/config.json || { printf 'Local config contains unarchived changes; reconcile first.\n' >&2; exit 1; }
    cp -p "$DEPLOY_LOCAL/config.json" "$DEPLOY_LOCAL/config.json.backup"
    rsync -az -e 'ssh -o BatchMode=yes' "$DEPLOY_TARGET:$DEPLOY_REMOTE/config.json" "$DEPLOY_LOCAL/config.json"
    printf 'Pulled server data. Review privately and archive deliberately; no automatic commit or cloud write.\n'
    ;;
  status)
    ssh -o BatchMode=yes "$DEPLOY_TARGET" 'systemctl is-active invest-platform; test ! -e /opt/invest-platform/config.json.pending || echo "pending journal present; manual reconciliation required"'
    ;;
  *) printf 'Usage: bash scripts/deploy-vultr.sh push|pull [--execute] | status\n'; exit 1;;
esac
