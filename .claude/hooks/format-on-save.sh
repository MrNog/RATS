#!/usr/bin/env bash
# Runs prettier on the file Claude just edited.
# Receives JSON on stdin: { tool_name, tool_input: { file_path, ... } }

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only format HTML, JS, CSS files
[[ "$FILE" =~ \.(html|js|css)$ ]] || exit 0

# Skip if prettier / npx not available
command -v npx >/dev/null 2>&1 || exit 0

npx --yes prettier --write "$FILE" --log-level=silent 2>/dev/null || true
