# PowerShell script to register DMS Scanner Watcher as a scheduled task
# Run this as Administrator or as the user who should run the watcher

$TaskName = "DMS_Scanner_Watcher"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = (Get-Command node).Source

if (-not $NodePath) {
    Write-Error "Node.js not found in PATH. Please install Node.js first."
    exit 1
}

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$ScriptDir\scanner-watcher.js`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Write-Host "Creating scheduled task: $TaskName" -ForegroundColor Cyan
Write-Host "Script directory: $ScriptDir"
Write-Host "Node path: $NodePath"
Write-Host ""

# Unregister existing task if it exists
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings | Out-Null

if ($?) {
    Write-Host "✓ Task registered successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The scanner watcher will now start automatically when you log in."
    Write-Host "To start it now, run:" -ForegroundColor Yellow
    Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
    Write-Host ""
    Write-Host "To stop it:" -ForegroundColor Yellow
    Write-Host "  Stop-ScheduledTask -TaskName `"$TaskName`""
    Write-Host ""
    Write-Host "To view logs, check Task Scheduler or run:" -ForegroundColor Yellow
    Write-Host "  Get-ScheduledTaskInfo -TaskName `"$TaskName`""
} else {
    Write-Error "Failed to register task. Run PowerShell as Administrator and try again."
    exit 1
}
