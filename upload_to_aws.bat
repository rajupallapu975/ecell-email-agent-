@echo off
title Deploy to AWS EC2 (13.233.76.8:3768)
echo =======================================================
echo   Deploying E-Cell Bulk Mail Agent to AWS EC2
echo   Target: 13.233.76.8:3768
echo =======================================================

set "DEFAULT_KEY=D:\aws\WEB Server.pem"
if exist "%DEFAULT_KEY%" (
    set "KEY_PATH=%DEFAULT_KEY%"
    echo Using detected key: %DEFAULT_KEY%
) else (
    set /p KEY_PATH="Enter path to your AWS .pem key (e.g. C:\Users\name\Downloads\my-key.pem): "
)

echo.
echo [1/3] Copying ecell_agent_aws.zip to EC2 (13.233.76.8)...
scp -i "%KEY_PATH%" -o StrictHostKeyChecking=no "d:\ecell_agent\ecell_agent_aws.zip" ubuntu@13.233.76.8:/home/ubuntu/
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ SCP failed. If you received "Permission denied (publickey)",
    echo please enter the exact .pem key associated with this EC2 instance.
    echo.
    set /p KEY_PATH="Enter the correct .pem key path: "
    scp -i "%KEY_PATH%" -o StrictHostKeyChecking=no "d:\ecell_agent\ecell_agent_aws.zip" ubuntu@13.233.76.8:/home/ubuntu/
)

echo.
echo [2/3] Extracting and running deployment script on EC2...
ssh -i "%KEY_PATH%" -o StrictHostKeyChecking=no ubuntu@13.233.76.8 "mkdir -p ~/ecell_agent && unzip -o ~/ecell_agent_aws.zip -d ~/ecell_agent && chmod +x ~/ecell_agent/deploy_aws.sh && bash ~/ecell_agent/deploy_aws.sh"

echo.
echo =======================================================
echo ✅ Deployment finished!
echo 🌐 Open in browser: http://13.233.76.8:3768
echo =======================================================
pause
