#!/usr/bin/env bash
set -euo pipefail

NPM_BIN="${WPMOO_NPM_BIN:-npm}"
NODE_BIN="${WPMOO_NODE_BIN:-node}"
PACKAGE_NAME="@wpmoo/toolkit"
PACKAGE_NAMES=("@wpmoo/toolkit" "wpmoo" "@wpmoo/odoo" "@wpmoo/odoo-dev")
ALIAS_PACKAGE_DIRS=("./packages/wpmoo" "./packages/odoo-compat" "./packages/odoo-dev-compat")
PACKAGE_TEST="test/package.test.ts"
SYNC_ALIAS_SCRIPT="scripts/sync-alias-packages.mjs"

if [[ ! -f package.json ]]; then
  echo "Run this script from the wpmoo-toolkit repository root." >&2
  exit 1
fi

actual_name="$("$NODE_BIN" -p "require('./package.json').name")"
if [[ "$actual_name" != "$PACKAGE_NAME" ]]; then
  echo "Unexpected package name: $actual_name" >&2
  exit 1
fi

if [[ -z "${NPM_CONFIG_CACHE:-}" ]]; then
  export NPM_CONFIG_CACHE="${TMPDIR:-/tmp}/npm-cache-wpmoo-publish"
fi
mkdir -p "$NPM_CONFIG_CACHE"

npm_version_exists() {
  local spec="$1"
  local output
  local status

  set +e
  output="$("$NPM_BIN" view "$spec" version 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    return 0
  fi

  if grep -Eqi '(^|[^A-Z])E404([^A-Z]|$)|No match found|404' <<<"$output"; then
    return 1
  fi

  echo "Failed to query npm registry for $spec:" >&2
  echo "$output" >&2
  exit "$status"
}

sync_alias_packages() {
  "$NODE_BIN" "$SYNC_ALIAS_SCRIPT"
}

any_package_version_exists() {
  local version="$1"
  local package_name

  for package_name in "${PACKAGE_NAMES[@]}"; do
    if npm_version_exists "$package_name@$version"; then
      echo "$package_name@$version already exists on npm."
      return 0
    fi
  done

  return 1
}

sync_alias_packages

current_version="$("$NODE_BIN" -p "require('./package.json').version")"
if any_package_version_exists "$current_version"; then
  echo "Bumping patch version."
  "$NPM_BIN" version patch --no-git-tag-version
  sync_alias_packages
  current_version="$("$NODE_BIN" -p "require('./package.json').version")"

  if any_package_version_exists "$current_version"; then
    echo "A package target for $current_version also exists on npm after one patch bump." >&2
    echo "Bump the version manually and rerun this script." >&2
    exit 1
  fi

  echo "Version was bumped to $current_version."
  echo "Commit package.json and package-lock.json, push them, then rerun this script."
  exit 1
else
  echo "Package version $current_version is not published for any target; keeping current version."
fi

echo "Running package metadata test..."
"$NPM_BIN" test -- "$PACKAGE_TEST"

echo "Running npm pack --dry-run..."
"$NPM_BIN" pack --dry-run
for package_dir in "${ALIAS_PACKAGE_DIRS[@]}"; do
  "$NPM_BIN" pack --dry-run "$package_dir"
done
