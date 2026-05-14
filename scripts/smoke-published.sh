#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${WPMOO_NODE_BIN:-node}"
NPX_BIN="${WPMOO_NPX_BIN:-npx}"

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
}
trap cleanup EXIT

run_wpmoo() {
  local flag="$1"
  local output

  if ! output="$("$NPX_BIN" --yes --package "$PACKAGE_SPEC" wpmoo "$flag" 2>&1)"; then
    echo "Published package smoke failed for wpmoo $flag using $PACKAGE_SPEC:" >&2
    echo "$output" >&2
    exit 1
  fi

  if [[ -z "${output//[[:space:]]/}" ]]; then
    echo "Published package smoke produced empty output for wpmoo $flag using $PACKAGE_SPEC." >&2
    exit 1
  fi

  printf '%s\n' "$output"
}

echo "Checking $PACKAGE_SPEC with npm cache $NPM_CONFIG_CACHE"

version_output="$(run_wpmoo --version)"
if [[ -z "$PACKAGE_OVERRIDE" && "$version_output" != *"$PACKAGE_VERSION"* ]]; then
  echo "Expected wpmoo --version output to include $PACKAGE_VERSION, got:" >&2
  echo "$version_output" >&2
  exit 1
fi

help_output="$(run_wpmoo --help)"
if [[ "$help_output" != *"Usage:"* && "$help_output" != *"wpmoo"* ]]; then
  echo "Expected wpmoo --help output to include usage text, got:" >&2
  echo "$help_output" >&2
  exit 1
fi

echo "Published package smoke passed for $PACKAGE_SPEC"
