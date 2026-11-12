# 掌机一键安装（施工单 025）。Song 在掌机的 PowerShell 里粘一行命令，跑的就是这个文件。里面没有任何钥匙。
# 做四件事：装 Python 3.12 / Git / GitHub CLI → 登录 GitHub（手机上输 8 位码）→ 把大管家下到 C:\songchengmin\pc-butler，
# 切到 handheld 分支 → 调 掌机\setup.ps1 装剩下的。能反复跑。
param(
  [string]$Root = 'C:\songchengmin\pc-butler',
  [string]$Repo = 'QIANSHOULAB/pc-butler',
  [string]$Branch = 'handheld',
  [switch]$NoAutostart,     # 演练用，原样传给 setup.ps1
  [switch]$NoStart,
  [switch]$NoClaude
)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # setup.ps1 and Python print UTF-8; read it as such (施工单 026)
function Say($text) { Write-Host ''; Write-Host "== $text" }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

Say '1/4 装 Python 3.12、Git、GitHub CLI（已有的跳过）'
foreach ($id in 'Python.Python.3.12', 'Git.Git', 'GitHub.cli') {
  winget list --id $id -e --accept-source-agreements *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host "  $id 已经有了" }
  else { winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements }
}
Refresh-Path
foreach ($c in 'git', 'gh') {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Write-Host "  $c 还是找不到。关掉这个窗口，开一个新的 PowerShell 再粘一次那行命令"; exit 1 }
}

Say '2/4 登录 GitHub：屏幕上出一个 8 位码，在手机上打开 github.com/login/device 输进去'
gh auth status *> $null
if ($LASTEXITCODE -eq 0) { Write-Host '  已经登录了' }
else { gh auth login --web --git-protocol https --hostname github.com }
gh auth setup-git

Say "3/4 下载大管家到 $Root（$Branch 分支）"
if (Test-Path (Join-Path $Root '.git')) {
  git -C $Root fetch origin $Branch
  git -C $Root checkout $Branch
  git -C $Root merge --ff-only "origin/$Branch"
}
else {
  New-Item -ItemType Directory -Force (Split-Path $Root) | Out-Null
  git clone --branch $Branch "https://github.com/$Repo.git" $Root
}
if (-not (Test-Path (Join-Path $Root '掌机\setup.ps1'))) { Write-Host '  没下下来，原因在上面。再粘一次那行命令'; exit 1 }

Say '4/4 装剩下的（掌机\setup.ps1）'
$pass = @()
if ($NoAutostart) { $pass += '-NoAutostart' }
if ($NoStart) { $pass += '-NoStart' }
if ($NoClaude) { $pass += '-NoClaude' }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root '掌机\setup.ps1') -Root $Root @pass
