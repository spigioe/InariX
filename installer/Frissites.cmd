@echo off
rem Kulon PowerShell ablakban fut, hogy a frissites felulirhassa ezt a fajlt is.
start "InariX frissites" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\update.ps1" %*
