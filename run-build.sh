#!/usr/bin/env bash
# Production build of the frontend into dist/. Path-relative, so it works from any cwd.
set -euo pipefail

cd "$(dirname "$0")"
npm run build
