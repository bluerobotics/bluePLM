@echo off
setlocal

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo Visual Studio Installer could not be located. 1>&2
  exit /b 1
)

set "VS_INSTALLATION="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALLATION=%%i"
if not defined VS_INSTALLATION (
  echo MSVC build tools could not be located. 1>&2
  exit /b 1
)

call "%VS_INSTALLATION%\Common7\Tools\VsDevCmd.bat" -arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%

if not exist "%~dp0..\build" mkdir "%~dp0..\build"
cl /nologo /EHsc /std:c++17 /Fo:"%~dp0..\build\process_exit_wait_test.obj" /Fe:"%~dp0..\build\process_exit_wait_test.exe" "%~dp0process_exit_wait_test.cpp"
if errorlevel 1 exit /b %errorlevel%

"%~dp0..\build\process_exit_wait_test.exe"
