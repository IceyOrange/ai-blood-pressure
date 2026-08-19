$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw 'Node.js was not found. Install Node.js 18 or later, then run this script again.'
}

$serverPath = Join-Path $PSScriptRoot 'dev-server.mjs'
& $nodePath $serverPath
