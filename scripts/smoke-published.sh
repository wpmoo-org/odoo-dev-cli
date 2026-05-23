#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${WPMOO_NODE_BIN:-node}"
NPX_BIN="${WPMOO_NPX_BIN:-npx}"
GIT_BIN="${WPMOO_GIT_BIN:-git}"
NPM_BIN="${WPMOO_NPM_BIN:-npm}"
SMOKE_TIMEOUT_SECONDS="${WPMOO_SMOKE_CMD_TIMEOUT_SECONDS:-30}"

if [[ ! "$SMOKE_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "WPMOO_SMOKE_CMD_TIMEOUT_SECONDS must be a positive integer, got: $SMOKE_TIMEOUT_SECONDS" >&2
  exit 1
fi

if [[ "$#" -gt 1 ]]; then
  echo "Usage: npm run smoke:published -- [package-spec-or-version]" >&2
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "Run this script from the wpmoo-toolkit repository root." >&2
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

is_exact_semver() {
  [[ "$1" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]
}

normalize_semver() {
  local value="$1"
  printf '%s\n' "${value#v}"
}

expected_version_from_override() {
  local value="$1"
  local suffix

  if [[ -z "$value" ]]; then
    printf '%s\n' "$PACKAGE_VERSION"
    return
  fi

  if is_exact_semver "$value"; then
    normalize_semver "$value"
    return
  fi

  suffix="${value##*@}"
  if [[ "$suffix" != "$value" ]] && is_exact_semver "$suffix"; then
    normalize_semver "$suffix"
  fi
}

PACKAGE_SPEC="$(resolve_package_spec "$PACKAGE_OVERRIDE")"
EXPECTED_PACKAGE_VERSION="$(expected_version_from_override "$PACKAGE_OVERRIDE")"
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
  local output npx_status npm_status
  local npx_timeout_reason="npx command timed out after ${SMOKE_TIMEOUT_SECONDS}s for wpmoo $* using $PACKAGE_SPEC."
  if output="$(run_with_timeout "$NPX_BIN" --yes --package "$PACKAGE_SPEC" wpmoo "$@" 2>&1)"; then
    :
  else
    npx_status=$?
    if [[ "$npx_status" -eq 124 ]]; then
      echo "$npx_timeout_reason" >&2
    else
      echo "npx command failed: status=$npx_status for wpmoo $* using $PACKAGE_SPEC." >&2
    fi
    if [[ -n "${output//[[:space:]]/}" ]]; then
      echo "npx output:" >&2
      echo "$output" >&2
    fi
    echo "Falling back to npm exec for this command." >&2
    if output="$(run_with_timeout "$NPM_BIN" exec --yes --package "$PACKAGE_SPEC" -- wpmoo "$@" 2>&1)"; then
      :
    else
      npm_status=$?
      if [[ "$npm_status" -eq 124 ]]; then
        echo "npm exec command timed out after ${SMOKE_TIMEOUT_SECONDS}s for wpmoo $* using $PACKAGE_SPEC." >&2
      else
        echo "npm exec command failed: status=$npm_status for wpmoo $* using $PACKAGE_SPEC." >&2
      fi
      if [[ -n "${output//[[:space:]]/}" ]]; then
        echo "npm exec output:" >&2
        echo "$output" >&2
      fi
      echo "Published package smoke failed for wpmoo $* using $PACKAGE_SPEC." >&2
      exit 1
    fi
  fi

  if [[ -z "${output//[[:space:]]/}" ]]; then
    echo "Published package smoke produced empty output for wpmoo $* using $PACKAGE_SPEC." >&2
    exit 1
  fi

  printf '%s\n' "$output"
}

run_with_timeout() {
  local output
  local runner_pid output_file start_time=0 status=0
  local runner="$1"
  local timeout_seconds="$SMOKE_TIMEOUT_SECONDS"
  shift

  output_file="$(mktemp)"
  (
    "$runner" "$@"
  ) >"$output_file" 2>&1 &
  runner_pid=$!
  start_time=$SECONDS

  while kill -0 "$runner_pid" 2>/dev/null; do
    if (( SECONDS - start_time >= timeout_seconds )); then
      kill -s TERM "$runner_pid" 2>/dev/null || true
      sleep 0.1
      kill -s KILL "$runner_pid" 2>/dev/null || true
      status=124
      break
    fi
    sleep 0.1
  done

  if [[ $status -eq 0 ]]; then
    wait "$runner_pid"
    status=$?
  else
    wait "$runner_pid" 2>/dev/null || true
  fi

  output="$(cat "$output_file")"
  rm -f "$output_file"
  printf '%s\n' "$output"
  return "$status"
}

is_truthy() {
  case "${1:-}" in
    1 | true | TRUE | yes | YES | y | Y) return 0 ;;
    *) return 1 ;;
  esac
}

matches_text() {
  local content="$1"
  local pattern="$2"

  [[ "$content" =~ $pattern ]]
}

run_wpmoo_in() {
  local cwd="$1"
  shift
  (
    cd "$cwd"
    run_wpmoo "$@"
  )
}

smoke_step() {
  echo "Smoke step: wpmoo $* using $PACKAGE_SPEC" >&2
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
  local smoke_root target source_repo dev_repo bin_dir source_repo_checkout source_list status_report reset_preview doctor_report moo_status_report moo_doctor_report restore_preview removal_preview removal_report
  smoke_root="$(mktemp -d "${TMPDIR:-/tmp}/wpmoo-published-env-smoke.XXXXXX")"
  target="$smoke_root/wpmoo_smoke_env"
  source_repo="$smoke_root/source_repo"
  dev_repo="$smoke_root/dev_repo"
  bin_dir="$smoke_root/bin"
  source_repo_checkout="$target/odoo/custom/src/private/wpmoo_smoke_module"

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
  PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" run_wpmoo_in "$CLI_RUN_ROOT" create \
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

  echo "- Adding smoke module"
  run_wpmoo_in "$target" add-module \
    --repo wpmoo_smoke_module \
    --module wpmoo_smoke_extra \
    --stage=false >/dev/null

  echo "- Checking package status --json"
  status_report="$(run_wpmoo_in "$target" status --json)"
  if ! matches_text "$status_report" '"schemaVersion"[[:space:]]*:[[:space:]]*1' ||
    ! matches_text "$status_report" '"command"[[:space:]]*:[[:space:]]*"status"' ||
    ! matches_text "$status_report" '"moduleCandidateCount"[[:space:]]*:[[:space:]]*1'; then
    echo "Expected wpmoo status --json to report one module candidate after add-module, got:" >&2
    echo "$status_report" >&2
    exit 1
  fi

  git_in "$source_repo_checkout" add wpmoo_smoke_extra
  git_in "$source_repo_checkout" commit -m "Add smoke module" >/dev/null

  echo "- Checking reset preview"
  reset_preview="$(run_wpmoo_in "$target" reset --dry-run --stage=false)"
  if ! matches_text "$reset_preview" 'files will be refreshed' ||
    ! matches_text "$reset_preview" '\.wpmoo/odoo\.json|External compose template assets' ||
    ! matches_text "$reset_preview" 'Files kept unchanged|source repo folders'; then
    echo "Expected reset --dry-run to print a generated-file reset preview, got:" >&2
    echo "$reset_preview" >&2
    exit 1
  fi

  echo "- Running doctor --fix"
  doctor_report="$(PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" run_wpmoo_in "$target" doctor --fix)"
  [[ "$doctor_report" == *"Doctor checks passed."* || "$doctor_report" == *"Applied safe doctor fixes:"* ]] ||
    {
      echo "Expected doctor --fix to pass, got:" >&2
      echo "$doctor_report" >&2
      exit 1
    }

  echo "- Checking generated ./moo status --json"
  moo_status_report="$(PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" "$target/moo" status --json)"
  if ! matches_text "$moo_status_report" '"schemaVersion"[[:space:]]*:[[:space:]]*1' ||
    ! matches_text "$moo_status_report" '"command"[[:space:]]*:[[:space:]]*"status"'; then
    echo "Expected ./moo status --json to emit status JSON, got:" >&2
    echo "$moo_status_report" >&2
    exit 1
  fi

  echo "- Checking generated ./moo doctor"
  moo_doctor_report="$(PATH="$bin_dir:$PATH" DOCKER_STUB_LOG="$smoke_root/docker.log" "$target/moo" doctor)"
  [[ "$moo_doctor_report" == *"Doctor checks passed."* || "$moo_doctor_report" == *"Applied safe doctor fixes:"* ]] ||
    {
      echo "Expected ./moo doctor to pass, got:" >&2
      echo "$moo_doctor_report" >&2
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

  echo "- Checking remove-module --dry-run"
  removal_preview="$(run_wpmoo_in "$target" remove-module \
    --repo wpmoo_smoke_module \
    --module wpmoo_smoke_extra \
    --dry-run \
    --stage=false)"
  [[ "$removal_preview" == *"Previewed removal of module wpmoo_smoke_extra"* ]] ||
    {
      echo "Expected remove-module --dry-run to preview module removal, got:" >&2
      echo "$removal_preview" >&2
      exit 1
    }

  echo "- Removing smoke module"
  removal_report="$(run_wpmoo_in "$target" remove-module \
    --repo wpmoo_smoke_module \
    --module wpmoo_smoke_extra \
    --deleteFiles \
    --stage=false)"
  [[ "$removal_report" == *"Removed module wpmoo_smoke_extra"* ]] ||
    {
      echo "Expected remove-module to remove the smoke module, got:" >&2
      echo "$removal_report" >&2
      exit 1
    }
  [[ ! -e "$target/odoo/custom/src/private/wpmoo_smoke_module/wpmoo_smoke_extra" ]] ||
    {
      echo "Expected wpmoo_smoke_extra directory to be removed." >&2
      exit 1
    }

  echo "Generated environment acceptance smoke passed for $PACKAGE_SPEC"
}

echo "Checking $PACKAGE_SPEC with npm cache $NPM_CONFIG_CACHE"

smoke_step --version
version_output="$(run_wpmoo_in "$CLI_RUN_ROOT" --version)"
if [[ -n "$EXPECTED_PACKAGE_VERSION" && "$version_output" != *"$EXPECTED_PACKAGE_VERSION"* ]]; then
  echo "Expected wpmoo --version output to include $EXPECTED_PACKAGE_VERSION, got:" >&2
  echo "$version_output" >&2
  exit 1
fi

smoke_step --help
help_output="$(run_wpmoo_in "$CLI_RUN_ROOT" --help)"
if [[ "$help_output" != *"Usage:"* && "$help_output" != *"wpmoo"* ]]; then
  echo "Expected wpmoo --help output to include usage text, got:" >&2
  echo "$help_output" >&2
  exit 1
fi

smoke_step create --help
create_help_output="$(run_wpmoo_in "$CLI_RUN_ROOT" create --help)"
if [[ "$create_help_output" != *"Usage:"* && "$create_help_output" != *"wpmoo create"* ]]; then
  echo "Expected wpmoo create --help output to include usage text, got:" >&2
  echo "$create_help_output" >&2
  exit 1
fi

smoke_step doctor --help
doctor_help_output="$(run_wpmoo_in "$CLI_RUN_ROOT" doctor --help)"
if [[ "$doctor_help_output" != *"Usage:"* && "$doctor_help_output" != *"wpmoo doctor"* ]]; then
  echo "Expected wpmoo doctor --help output to include usage text, got:" >&2
  echo "$doctor_help_output" >&2
  exit 1
fi

smoke_step status --help
status_help_output="$(run_wpmoo_in "$CLI_RUN_ROOT" status --help)"
if [[ "$status_help_output" != *"Usage:"* && "$status_help_output" != *"wpmoo status"* ]]; then
  echo "Expected wpmoo status --help output to include usage text, got:" >&2
  echo "$status_help_output" >&2
  exit 1
fi

if is_truthy "${WPMOO_SMOKE_ENVIRONMENT:-0}"; then
  run_environment_smoke
fi

echo "Published package smoke passed for $PACKAGE_SPEC"
