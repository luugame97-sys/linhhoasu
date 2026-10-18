param(
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$LogoPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing

$target = [System.Drawing.Bitmap]::new($TargetPath)
$logo = [System.Drawing.Bitmap]::new($LogoPath)
$output = [System.Drawing.Bitmap]::new(
    $target.Width,
    $target.Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$graphics = [System.Drawing.Graphics]::FromImage($output)
try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImageUnscaled($target, 0, 0)

    # Remove only the old vertical title strip before inserting the new logo.
    $graphics.FillRectangle([System.Drawing.Brushes]::Transparent, 0, 250, 190, 654)

    $logoWidth = 480
    $logoHeight = [int][Math]::Round($logo.Height * $logoWidth / $logo.Width)
    $destination = [System.Drawing.Rectangle]::new(0, 350, $logoWidth, $logoHeight)

    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($logo, $destination)

    $output.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $output.Dispose()
    $logo.Dispose()
    $target.Dispose()
}
