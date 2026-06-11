$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonCandidates = @(
    (Join-Path $repoRoot ".venv\Scripts\python.exe"),
    (Join-Path (Split-Path $repoRoot -Parent) ".venv\Scripts\python.exe")
)

$python = $pythonCandidates |
    Where-Object {
        if (-not (Test-Path $_)) {
            return $false
        }
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        & $_ -c "import sys" *> $null
        $works = $LASTEXITCODE -eq 0
        $ErrorActionPreference = $previousErrorAction
        return $works
    } |
    Select-Object -First 1
if (-not $python) {
    $python = (Get-Command python -ErrorAction Stop).Source
}

$env:PYTHONPATH = Join-Path $repoRoot "src"
Push-Location $repoRoot
try {
    & $python -m pytest tests/test_workflow_contract.py
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
