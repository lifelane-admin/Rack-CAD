$port = 8080
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "  Rack Slicer is running!" -ForegroundColor Cyan
    Write-Host "  URL: $prefix" -ForegroundColor Yellow
    Write-Host "  Press Ctrl+C in this window to stop." -ForegroundColor Gray
    Write-Host "==================================================" -ForegroundColor Green

    Start-Process $prefix

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }

        $localPath = Join-Path $PSScriptRoot $path.TrimStart('/')

        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)

            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            switch ($ext) {
                ".html"  { $response.ContentType = "text/html; charset=utf-8" }
                ".js"    { $response.ContentType = "application/javascript; charset=utf-8" }
                ".css"   { $response.ContentType = "text/css; charset=utf-8" }
                ".woff2" { $response.ContentType = "font/woff2" }
                ".woff"  { $response.ContentType = "font/woff" }
                ".png"   { $response.ContentType = "image/png" }
                ".svg"   { $response.ContentType = "image/svg+xml" }
                ".jpg"   { $response.ContentType = "image/jpeg" }
                ".jpeg"  { $response.ContentType = "image/jpeg" }
                ".json"  { $response.ContentType = "application/json" }
                default  { $response.ContentType = "application/octet-stream" }
            }

            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($buf, 0, $buf.Length)
        }
        $response.Close()
    }
} catch {
    Write-Host "Server stopped or port in use." -ForegroundColor Red
} finally {
    if ($listener.IsListening) { $listener.Stop() }
}
