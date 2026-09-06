$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskPythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($taskPythonCommand) { $taskPython = $taskPythonCommand.Source }
else {
    $taskPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (-not (Test-Path -LiteralPath $taskPython)) { throw '需要 Python 3.10+。安装后运行 python tools/run_checks.py。' }
}
if (Test-Path -LiteralPath (Join-Path $taskRoot 'tmp/pythonpkgs/playwright')) {
    $env:PYTHONPATH = (Join-Path $taskRoot 'tmp/pythonpkgs') + [IO.Path]::PathSeparator + $env:PYTHONPATH
}
$env:PYTHONIOENCODING = 'utf-8'
& $taskPython (Join-Path $PSScriptRoot 'run_checks.py') @args
exit $LASTEXITCODE
