#!/usr/bin/env bash
set -euo pipefail

# Version bump script for ThinkSuit monorepo
# Usage: ./scripts/version.sh [patch|minor|major]

BUMP_TYPE="${1:-}"

if [[ -z "$BUMP_TYPE" ]]; then
    echo "Usage: $0 [patch|minor|major]"
    exit 1
fi

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Error: Invalid bump type '$BUMP_TYPE'. Must be patch, minor, or major."
    exit 1
fi

echo "Bumping $BUMP_TYPE version..."

# Bump all package.json versions
npm version "$BUMP_TYPE" --workspaces --include-workspace-root --no-git-tag-version

# Sync hardcoded version strings
node scripts/sync-versions.js

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

# Commit and tag
git add -A
git commit -m "$NEW_VERSION"
git tag "v$NEW_VERSION"

echo ""
echo "✓ Version bumped to $NEW_VERSION"
echo "✓ Commit created and tagged as v$NEW_VERSION"
echo ""
echo "To push: git push && git push --tags"
