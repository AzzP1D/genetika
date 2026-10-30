# Пути к программам для сборки. Подключается так:  . .\tools\env.ps1
# Если рядом с папкой проекта лежит папка «Программы» (переносной комплект на внешнем диске),
# берутся программы оттуда — буква диска может быть любой. Иначе — программы этого компьютера.
$project = Split-Path $PSScriptRoot -Parent
$kit = Join-Path (Split-Path $project -Parent) 'Программы'
if (Test-Path $kit) {
  $env:JAVA_HOME = Join-Path $kit 'jdk-21'
  $env:ANDROID_HOME = Join-Path $kit 'Android\Sdk'
  $env:GRADLE_USER_HOME = Join-Path $kit 'Android\gradle'
  $env:BLENDER_EXE = Join-Path $kit 'Blender\blender.exe'
  $env:Path = (Join-Path $kit 'nodejs') + ';' + (Join-Path $kit 'Git\cmd') + ';' + $env:Path
  Write-Host "Программы: переносной комплект ($kit)"
} else {
  $env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\'
  $env:ANDROID_HOME = 'D:\Android\Sdk'
  $env:GRADLE_USER_HOME = 'D:\Android\gradle'
  $env:BLENDER_EXE = 'D:\Documents\Blender\blender.exe'
}
