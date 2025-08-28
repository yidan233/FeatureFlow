# PowerShell Test Script for Canary Feature Flag System
# Run this script directly in PowerShell: .\test-powershell.ps1

Write-Host "🚀 PowerShell Testing - Canary Feature Flag System" -ForegroundColor Blue
Write-Host "=================================================" -ForegroundColor Blue
Write-Host ""

$API_KEY = "canary-12345-secret"
$CONTROL_URL = "http://localhost:8080"
$EVAL_URL = "http://localhost:8081"
$METRICS_URL = "http://localhost:9091"

function Test-Service {
    param(
        [string]$ServiceName,
        [string]$Url,
        [int]$MaxRetries = 3
    )
    
    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "$Url/health" -TimeoutSec 10 -ErrorAction Stop
            $content = $response.Content | ConvertFrom-Json
            if ($content.status -eq "healthy") {
                Write-Host "✅ $ServiceName service: HEALTHY" -ForegroundColor Green
                return $true
            }
        }
        catch {
            if ($i -lt $MaxRetries) {
                Write-Host "⏳ $ServiceName not ready, retrying ($i/$MaxRetries)..." -ForegroundColor Yellow
                Start-Sleep -Seconds 3
            }
        }
    }
    
    Write-Host "❌ $ServiceName service: FAILED" -ForegroundColor Red
    return $false
}

# Test 1: Health Checks
Write-Host "🔍 Testing service health checks..." -ForegroundColor Cyan
$evalHealthy = Test-Service -ServiceName "Evaluation" -Url $EVAL_URL
$controlHealthy = Test-Service -ServiceName "Control Plane" -Url $CONTROL_URL
$metricsHealthy = Test-Service -ServiceName "Metrics" -Url $METRICS_URL

if (-not $evalHealthy) {
    Write-Host "💡 If services aren't running, start them in separate terminals:" -ForegroundColor Yellow
    Write-Host "   Terminal 1: npm run dev:eval" -ForegroundColor Gray
    Write-Host "   Terminal 2: npm run dev:control" -ForegroundColor Gray
    Write-Host "   Terminal 3: npm run dev:metrics" -ForegroundColor Gray
    exit 1
}

# Test 2: Flag Evaluation
Write-Host ""
Write-Host "🎯 Testing flag evaluation..." -ForegroundColor Cyan
try {
    $evalBody = @{
        flag_key = "dark_mode"
        user_context = @{ user_id = "test123" }
        default_value = $false
    } | ConvertTo-Json

    $evalHeaders = @{ 'Content-Type' = 'application/json' }
    $evalResponse = Invoke-WebRequest -Uri "$EVAL_URL/evaluate" -Method POST -Headers $evalHeaders -Body $evalBody
    $evalResult = $evalResponse.Content | ConvertFrom-Json
    
    Write-Host "✅ Flag evaluation: SUCCESS" -ForegroundColor Green
    Write-Host "   Flag: $($evalResult.flag_key)" -ForegroundColor Gray
    Write-Host "   Value: $($evalResult.value)" -ForegroundColor Gray
    Write-Host "   Reason: $($evalResult.reason)" -ForegroundColor Gray
}
catch {
    Write-Host "❌ Flag evaluation: FAILED" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test 3: Control Plane API (if available)
if ($controlHealthy) {
    Write-Host ""
    Write-Host "🎛️ Testing Control Plane API..." -ForegroundColor Cyan
    
    try {
        $headers = @{ 'X-API-Key' = $API_KEY }
        $flagsResponse = Invoke-WebRequest -Uri "$CONTROL_URL/api/flags" -Headers $headers
        $flagsData = $flagsResponse.Content | ConvertFrom-Json
        
        Write-Host "✅ Flag listing: SUCCESS" -ForegroundColor Green
        Write-Host "   Total flags: $($flagsData.total)" -ForegroundColor Gray
        
        # Show first 3 flags
        if ($flagsData.flags.Count -gt 0) {
            Write-Host "   Sample flags:" -ForegroundColor Gray
            $flagsData.flags | Select-Object -First 3 | ForEach-Object {
                Write-Host "     - $($_.key): $($_.name)" -ForegroundColor DarkGray
            }
        }
    }
    catch {
        Write-Host "❌ Control Plane API: FAILED" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    }
    
    # Test flag creation
    Write-Host ""
    Write-Host "🆕 Testing flag creation..." -ForegroundColor Cyan
    try {
        $flagBody = @{
            key = "powershell_test_flag"
            name = "PowerShell Test Flag"
            description = "Flag created by PowerShell test script"
            is_enabled = $true
            conditions = @()
        } | ConvertTo-Json
        
        $flagHeaders = @{
            'X-API-Key' = $API_KEY
            'Content-Type' = 'application/json'
        }
        
        $createResponse = Invoke-WebRequest -Uri "$CONTROL_URL/api/flags" -Method POST -Headers $flagHeaders -Body $flagBody
        $newFlag = $createResponse.Content | ConvertFrom-Json
        
        Write-Host "✅ Flag creation: SUCCESS" -ForegroundColor Green
        Write-Host "   Created flag: $($newFlag.key)" -ForegroundColor Gray
        Write-Host "   Flag ID: $($newFlag.id)" -ForegroundColor Gray
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 409) {
            Write-Host "ℹ️ Flag creation: Flag already exists (this is OK)" -ForegroundColor Blue
        } else {
            Write-Host "❌ Flag creation: FAILED" -ForegroundColor Red
            Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
        }
    }
}

# Test 4: Performance Test
Write-Host ""
Write-Host "🏃‍♂️ Testing performance (10 evaluations)..." -ForegroundColor Cyan
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

for ($i = 1; $i -le 10; $i++) {
    try {
        $perfBody = @{
            flag_key = "dark_mode"
            user_context = @{ user_id = "perf_test_$i" }
            default_value = $false
        } | ConvertTo-Json
        
        $perfHeaders = @{ 'Content-Type' = 'application/json' }
        Invoke-WebRequest -Uri "$EVAL_URL/evaluate" -Method POST -Headers $perfHeaders -Body $perfBody -TimeoutSec 5 | Out-Null
    }
    catch {
        # Ignore individual failures for performance test
    }
}

$stopwatch.Stop()
$avgTime = [math]::Round($stopwatch.ElapsedMilliseconds / 10, 1)

if ($avgTime -lt 100) {
    Write-Host "✅ Performance: ${avgTime}ms average (excellent)" -ForegroundColor Green
} elseif ($avgTime -lt 200) {
    Write-Host "✅ Performance: ${avgTime}ms average (good)" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Performance: ${avgTime}ms average (acceptable)" -ForegroundColor Blue
}

# Test 5: Metrics Check
Write-Host ""
Write-Host "📊 Testing metrics endpoint..." -ForegroundColor Cyan
try {
    $metricsResponse = Invoke-WebRequest -Uri "$METRICS_URL/metrics" -TimeoutSec 10
    if ($metricsResponse.Content -like "*flag_evaluations*") {
        Write-Host "✅ Metrics: Available with flag evaluation data" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ Metrics: Available but no evaluation data yet" -ForegroundColor Blue
    }
}
catch {
    Write-Host "❌ Metrics: Not available" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "🎉 PowerShell Test Summary" -ForegroundColor Blue
Write-Host "=========================" -ForegroundColor Blue
Write-Host "📱 Access Points:" -ForegroundColor Cyan
Write-Host "   🎛️  Control Plane: $CONTROL_URL" -ForegroundColor Gray
Write-Host "   ⚡  Evaluation API: $EVAL_URL" -ForegroundColor Gray
Write-Host "   📊  Metrics: $METRICS_URL/metrics" -ForegroundColor Gray
Write-Host "   📈  Prometheus: http://localhost:9090" -ForegroundColor Gray
Write-Host "   📊  Grafana: http://localhost:3000 (admin/admin)" -ForegroundColor Gray
Write-Host ""
Write-Host "🔑 API Key: $API_KEY" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 Next steps:" -ForegroundColor Cyan
Write-Host "   - Explore the APIs using the examples in README.md" -ForegroundColor Gray
Write-Host "   - Check Grafana dashboards for metrics" -ForegroundColor Gray
Write-Host "   - Integrate with your applications" -ForegroundColor Gray
