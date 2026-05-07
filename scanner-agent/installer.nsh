!macro customInstall
  # Check if scanner is already installed
  IfFileExists "$PROFILE\Documents\RHV-DMS-Scanner\config.json" 0 notInstalled
    MessageBox MB_YESNO "Scanner Agent is already installed. Do you want to reinstall?" IDYES continueInstall IDNO abortInstall
    goto continueInstall

  notInstalled:
  continueInstall:

  # Create directories
  CreateDirectory "$PROFILE\Documents\Scan"
  CreateDirectory "$PROFILE\Documents\RHV-DMS-Scanner"

  # Set up auto-start
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RHV-DMS-Scanner" '"$INSTDIR\${APPNAME}.exe"'

  goto done

  abortInstall:
    Abort "Installation cancelled by user"

  done:
!macroend

!macro customUnInstall
  # Remove auto-start
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RHV-DMS-Scanner"
!macroend