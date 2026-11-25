1. OpenCode Execution & Workflow Rules

Plan Before Large Multi-File Edits: When scaffolding new modules or refactoring full-stack schemas, outline the file changes first (especially when operating in plan mode) before writing code.

Never Hang the Bash Tool: Do NOT run blocking long-lived servers (uvicorn ... or npm run dev) directly without a timeout or background detachment, as OpenCode's shell tool waits for command exit. Always verify via one-shot build, typecheck, and test commands below.

Verify Every Change: After editing Python or TypeScript files, immediately run the corresponding lint/test command before finishing your turn.

Minimal, Modular Diffs: Keep edits focused on the requested task. Never rewrite unrelated files or leave placeholder TODO stubs in core math/rendering functions.

Strict Zero-Cost Open-Source Constraint: Never install paid SDKs, commercial pose APIs, or proprietary UI libraries. Only use free, locally runnable open-source packages (MIT, Apache 2.0, BSD-3-Clause).

2. Build, Dev & Verification Commands

Run these exact commands from the repository root (cricket-biomechanics/):

Backend (backend/ — Python 3.11+)

Install dependencies: cd backend && pip install -e ".[dev]" (or uv sync)

Run all unit tests: cd backend && pytest -v

Run single test file: cd backend && pytest tests/test_vector_math.py -v

Lint & format check: cd backend && ruff check . && ruff format --check .

Start API server (manual/local only): cd backend && uvicorn app.main:app --reload --port 8000