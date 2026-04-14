# DMS API Test Script
# Run in PowerShell: .\test-api.ps1

Write-Host "=== DMS API Testing ===" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n1. Testing Health Check..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get
Write-Host "Result: $($health.status) - $($health.message)"

# Test 2: Login
Write-Host "`n2. Testing Login..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@dms.com","password":"Admin@123"}'

if ($login.success) {
    Write-Host "Login SUCCESS!" -ForegroundColor Green
    $token = $login.data.accessToken
    Write-Host "Token: $($token.Substring(0, 50))..."
    
    $headers = @{ "Authorization" = "Bearer $token" }
    
    # Test 3: Get Profile
    Write-Host "`n3. Testing Get Profile..." -ForegroundColor Yellow
    $profile = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/profile" -Method Get -Headers $headers
    Write-Host "Name: $($profile.data.name)"
    Write-Host "Email: $($profile.data.email)"
    Write-Host "Role: $($profile.data.role)"
    
    # Test 4: Get All Files
    Write-Host "`n4. Testing Get All Files..." -ForegroundColor Yellow
    $files = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/files" -Method Get -Headers $headers
    Write-Host "Total Files: $($files.data.total)"
    
    # Test 5: Get Users (Admin)
    Write-Host "`n5. Testing Get Users (Admin)..." -ForegroundColor Yellow
    $users = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/users" -Method Get -Headers $headers
    Write-Host "Total Users: $($users.data.total)"
    
    # Test 6: Get Notifications
    Write-Host "`n6. Testing Get Notifications..." -ForegroundColor Yellow
    $notifs = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/notifications" -Method Get -Headers $headers
    Write-Host "Unread Count: $($notifs.data.unreadCount)"
    
} else {
    Write-Host "Login FAILED: $($login.message)" -ForegroundColor Red
}

Write-Host "`n=== Testing Complete ===" -ForegroundColor Cyan