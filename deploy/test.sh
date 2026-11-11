#!/usr/bin/env bash
# Tests that must pass before publishing (run by .github/workflows/pages.yml when it exists).
# They check the maths of web/js/core/ (pure modules, no browser): URL state, the Mandelbrot
# reference orbits and destinations, copy-and-rotate, trees, L-systems, the chaos game, palettes.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test web/tests/*.test.js
