# Запускает скрипт Blender без окна: tools\blender.ps1 blender\models\<имя>.py
# Скрипт строит модель, сохраняет app\models\<имя>.glb и картинку blender\previews\<имя>.png
# (четыре ракурса); затем модель сжимается (meshopt) для телефона.
param([Parameter(Mandatory)] [string]$Script)
$blender = 'D:\Documents\Blender\blender.exe'
$root = Split-Path $PSScriptRoot -Parent
& $blender --background --factory-startup --python-exit-code 1 --python (Join-Path $root $Script) -- $root 2>&1 |
  ForEach-Object { "$_" } | Where-Object { $_ -match 'OK|Error|Traceback|line \d+|Warning: ' }
$code = $LASTEXITCODE
if ($code -ne 0) { exit $code }
$name = [IO.Path]::GetFileNameWithoutExtension($Script)
$glb = Join-Path $root "app\models\$name.glb"
if (Test-Path $glb) {
  Push-Location $root
  npx.cmd gltf-transform meshopt $glb $glb --level medium *>&1 | Select-Object -Last 1
  Pop-Location
}
