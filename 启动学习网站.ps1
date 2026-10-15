param([switch]$NoBrowser, [int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$siteRoot = $PSScriptRoot
$siteUrl = "http://127.0.0.1:$Port"
$existing = $null
try { $existing = Invoke-RestMethod "$siteUrl/api/status" -TimeoutSec 2 } catch {}
if ($existing) {
    if ($existing.app -ne 'rk3588-learning') { throw "端口 $Port 被其他程序占用，请换一个 Port。" }
    Write-Output "学习网站已经运行：$siteUrl"
    if (-not $NoBrowser) { Start-Process $siteUrl }
    exit 0
}
$runtimePython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
if (-not (Test-Path -LiteralPath $runtimePython)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) { $pythonCommand = Get-Command python3 -ErrorAction SilentlyContinue }
    if (-not $pythonCommand) { throw '需要 Python 3.10 或更新版本。安装后重新运行，或执行 python learn/server.py。' }
    $runtimePython = $pythonCommand.Source
}
$siteRuntime = Join-Path $siteRoot '.runtime'
New-Item -ItemType Directory -Path $siteRuntime -Force | Out-Null
$serverFile = Join-Path $siteRoot 'learn/server.py'
$process = Start-Process -FilePath $runtimePython -ArgumentList @('-X', 'utf8', '-u', ('"' + $serverFile + '"'), '--port', "$Port") -WorkingDirectory $siteRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $siteRuntime 'server.out.log') -RedirectStandardError (Join-Path $siteRuntime 'server.err.log')
$process.Id | Set-Content -LiteralPath (Join-Path $siteRuntime 'server.pid')
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    try { $check = Invoke-RestMethod "$siteUrl/api/status" -TimeoutSec 1; if ($check.app -eq 'rk3588-learning') { $ready = $true; break } } catch {}
    if ($process.HasExited) { break }
}
if (-not $ready) { throw "服务没有启动。请查看 $siteRuntime/server.err.log，或检查端口是否占用。" }
Write-Output "学习网站已启动：$siteUrl"
Write-Output 'API 密钥仅保存在服务内存中；在网页设置中填写，不要写进脚本。'
if (-not $NoBrowser) { Start-Process $siteUrl }
