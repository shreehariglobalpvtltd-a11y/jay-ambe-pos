' Jay Ambe POS — one-click silent launcher (v29 Part A)
' Double-click this (ya Desktop shortcut) → server + POS window, koi black terminal nahi.
Option Explicit
Dim sh, fso, root
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & root & "\launcher.ps1""", 0, False
