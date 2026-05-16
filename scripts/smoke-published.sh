#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${WPMOO_NODE_BIN:-node}"
NPX_BIN="${WPMOO_NPX_BIN:-npx}"
GIT_BIN="${WPMOO_GIT_BIN:-git}"

if [[ "$#" -gt 1 ]]; then
  echo "Usage: npm run smoke:published -- [package-spec-or-version]" >&2
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "Run this script from the wpmoo-odoo repository root." >&2
  exit 1
fi

PACKAGE_NAME="$("$NODE_BIN" -p "require('./package.json').name")"
PACKAGE_VERSION="$("$NODE_BIN" -p "require('./package.json').version")"
PACKAGE_OVERRIDE="${1:-${WPMOO_PUBLISHED_PACKAGE_SPEC:-${WPMOO_PUBLISHED_PACKAGE_VERSION:-}}}"

resolve_package_spec() {
  local value="$1"

  if [[ -z "$value" ]]; then
    printf '%s@%s\n' "$PACKAGE_NAME" "$PACKAGE_VERSION"
    return
  fi

  if [[ "$value" == "$PACKAGE_NAME" || "$value" == "$PACKAGE_NAME@"* ]]; then
    printf '%s\n' "$value"
    return
  fi

  if [[ "$value" == @*/* || "$value" == *@* ]]; then
    printf '%s\n' "$value"
    return
  fi

  printf '%s@%s\n' "$PACKAGE_NAME" "$value"
}

PACKAGE_SPEC="$(resolve_package_spec "$PACKAGE_OVERRIDE")"
CREATED_NPM_CACHE=""
CREATED_SMOKE_ROOT=""
CREATED_CLI_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/wpmoo-published-smoke-cli.XXXXXX")"
CLI_RUN_ROOT="$CREATED_CLI_ROOT"

if [[ -z "${NPM_CONFIG_CACHE:-}" ]]; then
  CREATED_NPM_CACHE="$(mktemp -d "${TMPDIR:-/tmp}/wpmoo-published-smoke-npm-cache.XXXXXX")"
  export NPM_CONFIG_CACHE="$CREATED_NPM_CACHE"
else
  mkdir -p "$NPM_CONFIG_CACHE"
fi

cleanup() {
  if [[ -n "$CREATED_NPM_CACHE" ]]; then
    rm -rf "$CREATED_NPM_CACHE"
  fi
  if [[ -n "$CREATED_SMOKE_ROOT" ]]; then
    rm -rf "$CREATED_SMOKE_ROOT"
  fi
  if [[ -n "$CREATED_CLI_ROOT" ]]; then
    rm -rf "$CREATED_CLI_ROOT"
  fi
}
trap cleanup EXIT

run_wpmoo() {
  local output

  if ! output="$("$NPX_BIN" --yes --package "$PACKAGE_SPEC" wpmoo "$@" 2>&1)"; then
    echo "Published package smoke failed for wpmoo $* using $PACKAGE_SPEC:" >&2
    echo "$output" >&2
    exit 1
  fi

  if [[ -z "${output//[[:space:]]/}" ]]; then
    echo "Published package smoke produced empty output for wpmoo $* using $PACKAGE_SPEC." >&2
    exit 1
  fi

  printf '%s\n' "$output"
}

is_truthy() {
  case "${1:-}" in
    1 | true | TRUE | yes | YES | y | Y) return 0 ;;
    *) return 1 ;;
  esac
}

run_wpmoo_in() {
  local cwd="$1"
  shift
  (
    cd "$cwd"
    run_wpmoo "$@"
  )
}

git_in() {
  local cwd="$1"
  shift
  "$GIT_BIN" -C "$cwd" "$@"
}

create_local_git_repo() {
  local repo="$1"
  local title="$2"

  mkdir -p "$repo"
  git_in "$repo" init -b 19.0 >/dev/null
  git_in "$repo" config user.name "WPMoo Smoke"
  git_in "$repo" config user.email "smoke@example.com"
  printf '# %s\n' "$title" >"$repo/README.md"
  git_in "$repo" add README.md
  git_in "$repo" commit -m "Initial smoke repo" >/dev/null
}

write_docker_stub() {
  local stub_path="$1"

  cat >"$stub_path" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

case " $* " in
  " version ")
    echo "Docker version smoke"
    ;;
  " compose version ")
    echo "Docker Compose version smoke"
    ;;
  *" exec -T db pg_dump "*)
    printf 'stub dump for %s\n' "$*"
    ;;
  *)
    printf 'docker %s\n' "$*" >>"${DOCKER_STUB_LOG:-/dev/null}"
    ;;
esac
STUB
  chmod +x "$stub_path"
}

run_environment_smoke() {
  local smoke_root target source_repo dev_repo bin_dir source_list reset_preview doctor_report restore_preview
  smoke_root="$(mktemp -d "${TMPDIR:-/tmp}/wpmoo-published-env-smoke.XXXXXX")"
  target="$smoke_root/wpmoo_smoke_env"
  source_repo="$smoke_root/source_repo"
  dev_repo="$smoke_root/dev_repo"
  bin_dir="$smoke_root/bin"

  if ! is_truthy "${WPMOO_SMOKE_KEEP_ENVIRONMENT:-0}"; then
    CREATED_SMOKE_ROOT="$smoke_root"
  else
    echo "Keeping smoke environment at $smoke_root"
  fi

  mkdir -p "$bin_dir"
  create_local_git_repo "$source_repo" "source"
  create_local_git_repo "$dev_repo" "dev"
  write_docker_stub "$bin_dir/docker"

  echo "Running generated environment acceptance smoke..."
  echo "- Creating fresh environment"
  run_wpmoo_in "$CLI_RUN_ROOT" create \
    --product wpmoo_smoke_module \
    --target "$target" \
    --dev-repo-url "$dev_repo" \
    --source-repo-url "$source_repo" \
    --source-path wpmoo_smoke_module \
    --source-addons wpmoo_smoke_module \
    --odoo-version 19.0 \
    --init-empty-repos=false \
    --stage=false >/dev/null

  echo "- Checking source list"
  source_list="$(run_wpmoo_in "$target" source list)"
  [[ "$source_list" == *"wpmoo_smoke_module"* ]] ||
    {
      echo "Expected source list to include wpmoo_smoke_module, got:" >&2
      echo "$source_list" >&2
      exit 1
    }

  echo "- Syncing source manifest"
  run_wpmoo_in "$target" source sync --stage=false >/dev/null

  echo "- Checking reset preview"
  reset_preview="$(run_wpmoo_in "$target" reset --dry-run --stage=false)"
  [[ "$reset_preview" == *"Safe reset"* || "$reset_preview" == *"safe reset"* ]] ||
    {
      echo "Expected reset --dry-run to print a reset preview, got:" >&2
      echo "$reset_preview" >&2
      exit 1
    }

  echo "- Running doctor --fix"
  doctor_report="$(PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" run_wpmoo_in "$target" doctor --fix)"
  [[ "$doctor_report" == *"Doctor checks passed."* || "$doctor_report" == *"Applied safe doctor fixes:"* ]] ||
    {
      echo "Expected doctor --fix to pass, got:" >&2
      echo "$doctor_report" >&2
      exit 1
    }

  mkdir -p "$target/data/filestore/devel"
  printf 'attachment\n' >"$target/data/filestore/devel/attachment.txt"
  echo "- Checking snapshot"
  PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" "$target/moo" snapshot devel smoke-before >/dev/null

  echo "- Checking restore-snapshot --dry-run"
  restore_preview="$(PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" "$target/moo" restore-snapshot --dry-run smoke-before devel)"
  [[ "$restore_preview" == *"Restore snapshot preview"* ]] ||
    {
      echo "Expected restore-snapshot --dry-run to print a restore preview, got:" >&2
      echo "$restore_preview" >&2
      exit 1
    }

  echo "Generated environment acceptance smoke passed for $PACKAGE_SPEC"
}

echo "Checking $PACKAGE_SPEC with npm cache $NPM_CONFIG_CACHE"

version_output="$(run_wpmoo_in "$CLI_RUN_ROOT" --version)"
if [[ -z "$PACKAGE_OVERRIDE" && "$version_output" != *"$PACKAGE_VERSION"* ]]; then
  echo "Expected wpmoo --version output to include $PACKAGE_VERSION, got:" >&2
  echo "$version_output" >&2
  exit 1
fi

help_output="$(run_wpmoo_in "$CLI_RUN_ROOT" --help)"
if [[ "$help_output" != *"Usage:"* && "$help_output" != *"wpmoo"* ]]; then
  echo "Expected wpmoo --help output to include usage text, got:" >&2
  echo "$help_output" >&2
  exit 1
fi

if is_truthy "${WPMOO_SMOKE_ENVIRONMENT:-0}"; then
  run_environment_smoke
fi

echo "Published package smoke passed for $PACKAGE_SPEC"
