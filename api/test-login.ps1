$body = '{"email":"admin@dms.com","password":"Admin@123"}'
$result = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/login' -Method Post -ContentType 'application/json' -Body $body
Write-Host "Success:" $result.success
if ($result.success -eq $true) {
    Write-Host "User:" $result.data.user.name
    Write-Host "Role:" $result.data.user.role
    Write-Host "Department:" $result.data.user.department
    $tokenPreview = $result.data.accessToken.Substring(0, 30)
    Write-Host "Token:" $tokenPreview "..."
} else {
    Write-Host "Error:" $result.message
}