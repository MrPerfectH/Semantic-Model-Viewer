@echo off
setlocal
if defined SMV_NODE (
  "%SMV_NODE%" "%~dp0portable.cjs" %*
  exit /b
)
if /i not "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
  echo SMV: this Windows package supports x64. Native Windows ARM64 is not qualified. 1>&2
  exit /b 1
)
if not exist "%~dp0..\runtime\win-x64\node.exe" (
  echo SMV: install a complete portable plugin package; this source package has no private Windows runtime. 1>&2
  exit /b 1
)
"%~dp0..\runtime\win-x64\node.exe" "%~dp0portable.cjs" %*
