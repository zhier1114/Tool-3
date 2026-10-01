# 產生 App 圖示（深藍底、白色鎖頭）。用法：powershell -File scripts/build-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $out | Out-Null
$navy = [System.Drawing.Color]::FromArgb(15, 27, 45)

function New-Icon([int]$size, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($navy)
  $s = $size / 512.0
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $bg = New-Object System.Drawing.SolidBrush $navy
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single](40 * $s))
  # 鎖環
  $g.DrawArc($pen, [single](176 * $s), [single](120 * $s), [single](160 * $s), [single](170 * $s), 180, 180)
  $g.DrawLine($pen, [single](176 * $s), [single](195 * $s), [single](176 * $s), [single](250 * $s))
  $g.DrawLine($pen, [single](336 * $s), [single](195 * $s), [single](336 * $s), [single](250 * $s))
  # 鎖身與鑰匙孔
  $g.FillRectangle($white, [single](136 * $s), [single](240 * $s), [single](240 * $s), [single](180 * $s))
  $g.FillEllipse($bg, [single](232 * $s), [single](290 * $s), [single](48 * $s), [single](48 * $s))
  $g.FillRectangle($bg, [single](246 * $s), [single](320 * $s), [single](20 * $s), [single](60 * $s))
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png'
New-Icon 512 'icon-512.png'
New-Icon 180 'apple-touch-icon.png'
Write-Output "Icons written to $out"
