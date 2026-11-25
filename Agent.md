1. OpenCode Execution & Workflow Rules

Plan Before Large Multi-File Edits: When scaffolding new modules or refactoring full-stack schemas, outline the file changes first (especially when operating in plan mode) before writing code.

Never Hang the Bash Tool: Do NOT run blocking long-lived servers (uvicorn ... or npm run dev) directly without a timeout or background detachment, as OpenCode's shell tool waits for command exit. Always verify via one-shot build, typecheck, and test commands below.

Verify Every Change: After editing Python or TypeScript files, immediately run the corresponding lint/test command before finishing your turn.

Minimal, Modular Diffs: Keep edits focused on the requested task. Never rewrite unrelated files or leave placeholder TODO stubs in core math/rendering functions.

Strict Zero-Cost Open-Source Constraint: Never install paid SDKs, commercial pose APIs, or proprietary UI libraries. Only use free, locally runnable open-source packages (MIT, Apache 2.0, BSD-3-Clause).

2. Git & PR Workflow

Apply this workflow to EVERY feature addition or bug fix:

1. Never commit directly to `main`. Start from an up-to-date `main` and create a new descriptive branch (`feat/...` or `fix/...`):
   git checkout main
   git pull
   git checkout -b feat/<short-description>

2. Run the relevant checks before committing:
   - Backend: `cd backend && pytest -v`
   - Frontend: `cd frontend && npm run build`

3. Commit with a clean conventional commit message.

4. Push the branch:
   git push -u origin <branch>

5. Open a Draft Pull Request with a clear title and a structured description (What changed, Why, How tested):
   gh pr create --draft --title "<type>: <summary>" --body "<description>"

3. Build, Dev & Verification Commands

Run these exact commands from the repository root (cricket-biomechanics/):

Backend (backend/ — Python 3.11+)

Install dependencies: cd backend && pip install -e ".[dev]" (or uv sync)

Run all unit tests: cd backend && pytest -v

Run single test file: cd backend && pytest tests/test_vector_math.py -v

Lint & format check: cd backend && ruff check . && ruff format --check .

Start API server (manual/local only): cd backend && uvicorn app.main:app --reload --port 8000