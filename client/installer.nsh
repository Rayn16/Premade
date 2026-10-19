; Uninstalling also removes the lolprox:// app links the app sets up for itself when it starts (main.js)
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\lolprox"
!macroend
