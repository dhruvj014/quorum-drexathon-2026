# Intern Setup (Windows 11)

Read from the repository docs (`github.com/nace-ai/intern`, `README.md` and `docs/usage.md`) on 2026-11-14. **Not run yet.** The docs do not mention Windows at all, so treat native Windows as untested and keep the Docker fallback ready.

## What Intern needs

| Part | What | Key |
|---|---|---|
| System 1 (supervisor) | Drex from the Nace console, default `drex-latest`. Required; there is no offline stand-in | `NACE_API_KEY` |
| System 2 (the agent) | Any chat model: `deepinfra`, `openrouter`, `fireworks`, `together`, `groq`, `openai`, `anthropic`, or a local model | `<NAME>_API_KEY`, for example `DEEPINFRA_API_KEY` |

So Intern needs the Nace key plus **one LLM key**. DeepInfra is a supported provider, and it is also a partner tool and our cheap baseline. One DeepInfra key covers all three uses.

## Install

Python 3.12 is installed (3.12 or later is required). `uv` is not installed.

```powershell
pip install uv
uv tool install "intern-agent @ git+https://github.com/nace-ai/intern"
intern --help
```

If `intern` is not found afterwards, run `uv tool update-shell` and open a new terminal. Without `uv`: `pip install "intern-agent @ git+https://github.com/nace-ai/intern"`.

## Keys

Create `C:\Users\<you>\.intern\.env` (one `KEY=value` per line; read by every entry point):

```text
NACE_API_KEY=nace_sk_...
DEEPINFRA_API_KEY=...
```

Keep this file out of the project folder. The repository will be public.

## First run

```powershell
intern models                     # lists the System 1 choices the console serves
cd d:\Coding\Drexathon\Quorum
intern --system2 deepinfra/deepseek-ai/DeepSeek-V4-Pro "List the files in .plans and summarise build-spec.md in five lines"
```

A model name is `provider/model`; everything after the first slash goes to the provider as written. Headless: add `-p`. JSON events, one per line: `intern -p --json --system2 M -- "task"`.

Optional config in `~/.intern/config.toml`:

```toml
system2 = "deepinfra/deepseek-ai/DeepSeek-V4-Pro"

[system1]
backend = "console"
model = "drex-latest"
```

## Project rules for Intern

Intern reads `AGENTS.md` from the repository root down to the working directory. Put our rules there (stack, contracts, "labels never reach a model", "keys only in `.env`"). It is followed literally, so keep it short and exact.

## Three ways we use it (in order of certainty)

1. **Build the project with it.** Give Intern real build tasks (for example the case builder, tests for `policy.py`, the README). This satisfies "Build with Intern" in the plainest reading. Its sessions are journaled in `~/.intern/`; keep them as proof, and put a short "Built with Intern" section in the README naming which parts.
2. **Run it inside the product** as the "verify" investigator (`organizer-update.md` section 3.1): the backend starts `intern -p --json ...` as a subprocess and streams its events to the drawer. A Python interface also exists (`from intern.config import Bootstrap, Options`, then `async with await bootstrap.session(callback) as session`; see `docs/capability-settings.md` near line 478), but the subprocess is simpler and safer for today.
3. **Its document workspace** (optional): `uv tool install "intern-agent[workspace,ocr] @ git+..."` and `[capabilities.workspace] enabled = true`. Intern can then index a folder of PDFs locally and search it with Drex (`decision_files`). Use only if the hosted Drex Search workspace fails; do not build both.

## If it does not work on Windows

Intern runs shell commands, and its docs only show Unix shells. If the first run fails on native Windows:

1. Try it from Git Bash.
2. Use Docker Desktop (installed on this machine; WSL has only the Docker distribution, no Ubuntu):

```powershell
docker run -it --rm -v d:\Coding\Drexathon\Quorum:/work -w /work -e NACE_API_KEY -e DEEPINFRA_API_KEY python:3.12 bash
# inside: pip install uv && uv tool install "intern-agent @ git+https://github.com/nace-ai/intern" && export PATH=$PATH:/root/.local/bin
```

Give this 20 minutes at most. If neither works, ask a Nace engineer in the room; they wrote it.

## Guard behaviour to know

Fixed rules refuse dangerous commands (deleting the repository, force-push, reading or sending `.env` files, `sudo`). Drex judges other risky calls each turn. A refused call returns a refusal and the run continues. Do not ask Intern to read `.env`.
