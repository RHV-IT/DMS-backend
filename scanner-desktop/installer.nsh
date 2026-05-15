!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\Document Scanner Agent"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\Document Scanner Agent"
!macroend

!macro customWelcomePage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Welcome to Document Scanner Agent Setup"
  Pop $0

  ${NSD_CreateLabel} 0 30u 100% 32u "This will install Document Scanner Agent on your computer.$\r$\n$\r$\nThe agent will run silently in the background and automatically scan and upload documents."
  Pop $0

  nsDialogs::Show
!macroend

!macro customInstall
  # Create scan directory
  CreateDirectory "$DOCUMENTS\Scan"
  CreateDirectory "$DOCUMENTS\Document Scanner Agent"

  # Set up auto-start (will be handled by the app itself)
  # The app will use electron's setLoginItemSettings
!macroend

!macro customFinishPage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Installation Complete"
  Pop $0

  ${NSD_CreateLabel} 0 30u 100% 32u "Document Scanner Agent has been successfully installed.$\r$\n$\r$\nThe agent will start automatically when you log in to Windows."
  Pop $0

  ${NSD_CreateCheckbox} 0 70u 100% 12u "&Launch Document Scanner Agent now"
  Pop $1
  ${NSD_Check} $1

  nsDialogs::Show

  ${NSD_GetState} $1 $2
  ${If} $2 == ${BST_CHECKED}
    Exec '"$INSTDIR\DocumentScannerAgent.exe"'
  ${EndIf}
!macroend