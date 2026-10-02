param(
    [ValidateSet('build', 'test', 'typecheck', 'dev', 'start', 'install')]
    [string]$Action = 'dev',
    [ValidateRange(1024, 65535)]
    [int]$Port = 3006
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'source'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) {
    throw 'Node.js 22.13 or newer is required. Install Node.js, then run this command again.'
}
$npmLocal = Join-Path $projectRoot '.local-tools\npm\bin\npm-cli.js'
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmArgs = switch ($Action) {
    'install' { @('ci', '--no-audit', '--no-fund', '--cache', (Join-Path $projectRoot '.local-cache\npm')) }
    'dev' { @('run', 'dev:local', '--', '--port', "$Port") }
    'start' { @('run', 'start', '--', '--hostname', '127.0.0.1', '--port', "$Port") }
    default { @('run', $Action) }
}
$previousPath = $env:PATH
Push-Location -LiteralPath $sourceRoot
try {
    $env:PATH = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $previousPath
    if (Test-Path -LiteralPath $npmLocal) {
        & $nodePath $npmLocal @npmArgs
    } elseif ($npmCommand) {
        & $npmCommand.Source @npmArgs
    } else {
        throw 'npm is unavailable. Install Node.js with npm, then run project.ps1 install.'
    }
    $taskExitCode = $LASTEXITCODE
} finally {
    Pop-Location
    $env:PATH = $previousPath
}
exit $taskExitCode
