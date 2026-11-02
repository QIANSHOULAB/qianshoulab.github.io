# 在 Windows 上本地打包（和 GitHub Actions 里一样）：
#   cd zhike\app ; powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
python -m pip install -r requirements.txt pyinstaller==6.11.1 pytest==8.3.4
python -m pytest -q tests
python make_icon.py
python -m PyInstaller --noconfirm --clean --onefile --windowed --name Zhike --icon zhike.ico `
  --add-data "ui;ui" --collect-all webview --hidden-import clr `
  --hidden-import keyring.backends.Windows --collect-submodules keyring.backends `
  app.py
$p = Start-Process dist\Zhike.exe -ArgumentList "--selftest","selftest.json" -Wait -PassThru
Get-Content selftest.json
if ($p.ExitCode -ne 0) { throw "selftest failed" }
