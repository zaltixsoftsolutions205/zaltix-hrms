@echo off
echo ========================================
echo  HRMS + CRM System Setup
echo ========================================
echo.

echo [1/4] Installing backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 ( echo ERROR: Backend npm install failed & pause & exit /b 1 )
cd ..

echo.
echo [2/4] Installing frontend dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 ( echo ERROR: Frontend npm install failed & pause & exit /b 1 )
cd ..

echo.
echo [3/4] Creating uploads directory...
mkdir backend\uploads\payslips 2>nul

echo.
echo ========================================
echo  SETUP COMPLETE!
echo ========================================
echo.
echo IMPORTANT BEFORE STARTING:
echo  1. Edit backend\.env and set your email credentials
echo  2. Make sure MongoDB is running on localhost:27017
echo  3. Run the admin seeder: cd backend ^& node seed.js
echo.
echo TO START THE APP:
echo  - Backend:  cd backend  then  npm run dev
echo  - Frontend: cd frontend then  npm run dev
echo.
echo URLs:
echo  - Frontend: http://localhost:5173
echo  - Backend:  http://localhost:5000
echo.
pause
