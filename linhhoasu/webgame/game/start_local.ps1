$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 18080

# check port
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "port $port 已在监听，直接打开浏览器"
} else {
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) { throw '找不到 python，请先安装 Python 3' }
    Start-Process -FilePath $py -ArgumentList '-m','http.server',"$port",'--bind','127.0.0.1' -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep 2
    Write-Host "本地服务已启动: http://127.0.0.1:$port/index.html"
}
Start-Process 'http://127.0.0.1:18080/index.html?backendHost=192.168.200.130&httpPort=18080&wsPort=9200'
Write-Host "停止服务: Get-Process python | Stop-Process  (或找到对应 PID 结束)"
