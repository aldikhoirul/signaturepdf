$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null

$white = [System.Drawing.Color]::White

function New-SignaturePath {
    $path = New-Object -TypeName System.Drawing.Drawing2D.GraphicsPath
    $path.StartFigure()
    $path.AddBezier(238, 636, 322, 438, 398, 396, 436, 500)
    $path.AddBezier(436, 500, 474, 606, 506, 612, 540, 478)
    $path.AddBezier(540, 478, 578, 332, 636, 344, 660, 474)
    $path.AddBezier(660, 474, 684, 596, 736, 606, 796, 520)
    return $path
}

function New-SignaturePen([double] $width) {
    $pen = New-Object -TypeName System.Drawing.Pen -ArgumentList $white, $width
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    return $pen
}

function New-Underline([double] $width) {
    $color = [System.Drawing.Color]::FromArgb(150, 255, 255, 255)
    $pen = New-Object -TypeName System.Drawing.Pen -ArgumentList $color, $width
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    return $pen
}

# ---------- Icon 1024x1024 ----------
$size = 1024
$icon = New-Object -TypeName System.Drawing.Bitmap -ArgumentList $size, $size
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$rect = New-Object -TypeName System.Drawing.Rectangle -ArgumentList 0, 0, $size, $size
$brush = New-Object -TypeName System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
    [System.Drawing.Color]::FromArgb(255, 55, 48, 163),
    45.0
)
$g.FillRectangle($brush, $rect)
$g.DrawPath((New-SignaturePen 54), (New-SignaturePath))
$g.DrawLine((New-Underline 24), 286, 742, 738, 742)

$g.Dispose()
$icon.Save((Join-Path $assets 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

# ---------- Adaptive icon layers ----------
$fg = New-Object -TypeName System.Drawing.Bitmap -ArgumentList $size, $size
$fgGraphics = [System.Drawing.Graphics]::FromImage($fg)
$fgGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$fgGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$fgGraphics.TranslateTransform(512, 512)
$fgGraphics.ScaleTransform(1.5, 1.5)
$fgGraphics.TranslateTransform(-512, -512)
$fgGraphics.DrawPath((New-SignaturePen 54), (New-SignaturePath))
$fgGraphics.DrawLine((New-Underline 24), 286, 742, 738, 742)
$fgGraphics.Dispose()
$fg.Save((Join-Path $assets 'icon-foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fg.Dispose()

$bg = New-Object -TypeName System.Drawing.Bitmap -ArgumentList $size, $size
$bgGraphics = [System.Drawing.Graphics]::FromImage($bg)
$bgGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$bgGraphics.FillRectangle($brush, $rect)
$bgGraphics.Dispose()
$bg.Save((Join-Path $assets 'icon-background.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bg.Dispose()

# ---------- Splash 2732x2732 ----------
$splashSize = 2732
$splash = New-Object -TypeName System.Drawing.Bitmap -ArgumentList $splashSize, $splashSize
$sg = [System.Drawing.Graphics]::FromImage($splash)
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$sg.Clear([System.Drawing.Color]::FromArgb(255, 242, 245, 250))

$logoSize = 720
$logoX = [int](($splashSize - $logoSize) / 2)
$logoRect = New-Object -TypeName System.Drawing.Rectangle -ArgumentList $logoX, $logoX, $logoSize, $logoSize
$radius = 150
$diameter = $radius * 2

$logoPath = New-Object -TypeName System.Drawing.Drawing2D.GraphicsPath
$logoPath.AddArc($logoRect.X, $logoRect.Y, $diameter, $diameter, 180, 90)
$logoPath.AddArc($logoRect.Right - $diameter, $logoRect.Y, $diameter, $diameter, 270, 90)
$logoPath.AddArc($logoRect.Right - $diameter, $logoRect.Bottom - $diameter, $diameter, $diameter, 0, 90)
$logoPath.AddArc($logoRect.X, $logoRect.Bottom - $diameter, $diameter, $diameter, 90, 90)
$logoPath.CloseFigure()

$logoBrush = New-Object -TypeName System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
    $logoRect,
    [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
    [System.Drawing.Color]::FromArgb(255, 55, 48, 163),
    45.0
)
$sg.FillPath($logoBrush, $logoPath)

$scale = $logoSize / $size
$sg.TranslateTransform($logoX, $logoX)
$sg.ScaleTransform($scale, $scale)
$sg.DrawPath((New-SignaturePen 54), (New-SignaturePath))
$sg.DrawLine((New-Underline 24), 286, 742, 738, 742)

$sg.Dispose()
$splash.Save((Join-Path $assets 'splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$splash.Dispose()

# ---------- PWA icons ----------
$pwaIcons = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $pwaIcons | Out-Null

function Save-ResizedIcon([string] $sourcePath, [int] $edge, [string] $targetPath) {
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    $target = New-Object -TypeName System.Drawing.Bitmap -ArgumentList $edge, $edge
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $edge, $edge)
    $graphics.Dispose()
    $source.Dispose()
    $target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
}

$iconPath = Join-Path $assets 'icon.png'
Save-ResizedIcon $iconPath 192 (Join-Path $pwaIcons 'icon-192.png')
Save-ResizedIcon $iconPath 512 (Join-Path $pwaIcons 'icon-512.png')
Save-ResizedIcon $iconPath 180 (Join-Path $pwaIcons 'apple-touch-icon.png')

Write-Output 'Aset icon, splash, dan ikon PWA dibuat.'
