param([string]$ListFile)
# Windows 內建 OCR（繁體中文）— 每行輸入：<圖片路徑>\t<輸出 JSON 路徑>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) {
    $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op))
    $null = $task.Wait(-1)
    $task.Result
}
$lang = New-Object Windows.Globalization.Language 'zh-Hant-TW'
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if ($null -eq $engine) { Write-Error '找不到可用的 OCR 語言套件'; exit 1 }
$count = 0
foreach ($row in [IO.File]::ReadAllLines($ListFile, [Text.Encoding]::UTF8)) {
    if (-not $row) { continue }
    $parts = $row -split "`t"
    $srcPath = $parts[0]; $dstPath = $parts[1]
    try {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($srcPath)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $lines = @()
        foreach ($ln in $result.Lines) { $lines += $ln.Text }
        $stream.Dispose()
        $json = ConvertTo-Json -InputObject @($lines) -Compress
        if (-not $json -or $json -eq 'null') { $json = '[]' }
        [IO.File]::WriteAllText($dstPath, $json, (New-Object Text.UTF8Encoding $false))
        $count++
        if ($count % 20 -eq 0) { Write-Host "  OCR $count" }
    } catch {
        Write-Host "  OCR 失敗: $srcPath $_"
        [IO.File]::WriteAllText($dstPath, '[]', (New-Object Text.UTF8Encoding $false))
    }
}
