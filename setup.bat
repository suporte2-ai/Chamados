@echo off
echo === Configuracao inicial do Chamados ===
echo.

echo [1/4] Iniciando banco de dados (Docker)...
docker-compose up -d postgres
if %errorlevel% neq 0 (
    echo ERRO: Docker nao encontrado ou falhou. Verifique se o Docker Desktop esta rodando.
    pause
    exit /b 1
)
echo Aguardando PostgreSQL ficar pronto...
timeout /t 3 /nobreak >nul

echo.
echo [2/4] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo ERRO: npm install falhou.
    pause
    exit /b 1
)

echo.
echo [3/4] Rodando migrations do banco...
cd backend
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo ERRO: Migration falhou. Verifique o DATABASE_URL em backend\.env
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [4/4] Populando banco com dados de demonstracao...
cd backend
call node prisma/seed.js
cd ..

echo.
echo === Setup concluido! ===
echo Para iniciar o sistema, rode: npm run dev
echo.
pause
