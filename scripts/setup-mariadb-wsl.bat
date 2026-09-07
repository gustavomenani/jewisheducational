@echo off
echo.
echo  MariaDB no WSL - execute estes comandos NO TERMINAL WSL (vai pedir senha sudo):
echo.
echo  cd ^<repo-root^>
echo  sed -i 's/\r$//' scripts/setup-mariadb-wsl.sh
echo  chmod +x scripts/setup-mariadb-wsl.sh
echo  ./scripts/setup-mariadb-wsl.sh
echo.
echo  Depois, ainda no WSL ou no PowerShell:
echo  npm run db:setup
echo  npm run dev
echo.
pause
