#!/usr/bin/env bash
set -euo pipefail

NPM_BIN="${WPMOO_NPM_BIN:-npm}"
NODE_BIN="${WPMOO_NODE_BIN:-node}"
PACKAGE_NAME="@wpmoo/odoo"
PACKAGE_TEST="test/package.test.ts"

if [[ ! -f package.json ]]; then
  echo "Run this script from the wpmoo-odoo repository root." >&2
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

current_version="$("$NODE_BIN" -p "require('./package.json').version")"
if npm_version_exists "$PACKAGE_NAME@$current_version"; then
  echo "$PACKAGE_NAME@$current_version already exists on npm; bumping patch version."
  "$NPM_BIN" version patch --no-git-tag-version
  current_version="$("$NODE_BIN" -p "require('./package.json').version")"

  if npm_version_exists "$PACKAGE_NAME@$current_version"; then
    echo "$PACKAGE_NAME@$current_version also exists on npm after one patch bump." >&2
    echo "Bump the version manually and rerun this script." >&2
    exit 1
  fi
else
  echo "$PACKAGE_NAME@$current_version is not published yet; keeping current version."
fi

echo "Running package metadata test..."
"$NPM_BIN" test -- "$PACKAGE_TEST"

echo "Running npm pack --dry-run..."
"$NPM_BIN" pack --dry-run

echo "Publishing $PACKAGE_NAME@$current_version..."
"$NPM_BIN" publish --access public
