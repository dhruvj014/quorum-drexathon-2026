# Runs Intern in Docker against this repo.
# Keys are read from .intern-home\.env (NACE_API_KEY, DEEPINFRA_API_KEY). That folder is git-ignored.
# Usage:
#   .\intern\run.ps1 "task text"                 # headless, readable output
#   .\intern\run.ps1 -Json "task text"           # one JSON event per line (used by the backend)
#   .\intern\run.ps1 -Interactive                # terminal UI
param(
    [Parameter(Position = 0)][string]$Task,
    [string]$Model = $(if ($env:INTERN_SYSTEM2) { $env:INTERN_SYSTEM2 } else { "deepinfra/anthropic/claude-opus-5-5" }),
    [switch]$Json,
    [switch]$Interactive,
    [int]$MaxTurns = 30
)
$root = Split-Path -Parent $PSScriptRoot
$common = @(
    "--rm",
    "-v", "${root}:/work",
    "-v", "${root}\.intern-home:/intern-home",
    "--env-file", "${root}\.intern-home\.env",
    "-e", "OLLAMA_BASE_URL=http://host.docker.internal:11434/v1"
)
if ($Interactive) {
    docker run -it @common quorum-intern --system2 $Model
} elseif ($Json) {
    docker run @common quorum-intern -p --json --max-turns $MaxTurns --system2 $Model -- $Task
} else {
    docker run @common quorum-intern -p --max-turns $MaxTurns --system2 $Model $Task
}
