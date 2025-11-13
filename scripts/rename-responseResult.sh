#!/usr/bin/env bash
set -euo pipefail

# Rename responseResult to handlerResult across the codebase
# This script uses sed to perform the replacement in all relevant files

echo "🔍 Finding files containing 'responseResult'..."

# Find all .js and .json files containing responseResult
files=$(grep -rl "responseResult" \
    packages/thinksuit/engine/ \
    packages/thinksuit/tests/ \
    2>/dev/null || true)

if [ -z "$files" ]; then
    echo "✅ No files found containing 'responseResult'"
    exit 0
fi

echo "📝 Files to update:"
echo "$files" | sed 's/^/  - /'
echo ""

# Count total occurrences
total=$(echo "$files" | xargs grep -o "responseResult" | wc -l | tr -d ' ')
echo "📊 Total occurrences to replace: $total"
echo ""

read -p "Continue with replacement? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

echo "🔄 Performing replacement..."

# Perform the replacement
echo "$files" | while IFS= read -r file; do
    if [ -f "$file" ]; then
        echo "  Updating: $file"
        sed -i '' 's/responseResult/handlerResult/g' "$file"
    fi
done

echo ""
echo "✅ Replacement complete!"
echo ""
echo "🧪 Suggested next steps:"
echo "  1. Run tests: npm test"
echo "  2. Review changes: git diff"
echo "  3. Test a sample execution: npm run exec -- --trace 'test input' 2>&1 | tail -20"
