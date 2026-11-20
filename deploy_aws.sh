#!/usr/bin/env bash
set -e

echo "======================================================="
echo "  🚀 E-Cell Bulk Mail Agent - AWS Deployment Script"
echo "  Target Host: 13.233.76.8 | Port: 3768"
echo "======================================================="

# 1. Update packages and install Node.js 20 LTS if not present
sudo apt-get update -y
sudo apt-get install -y curl unzip build-essential

if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[1/4] Node.js is already installed: $(node -v)"
fi

# 2. Install PM2 daemon process manager
echo "[2/4] Installing PM2..."
sudo npm install -g pm2

# 3. Install project dependencies
echo "[3/4] Installing npm packages..."
cd "$(dirname "$0")"
npm install --production

# 4. Open port in Ubuntu UFW firewall if enabled
if sudo ufw status | grep -q "Status: active"; then
    echo "Opening port 3768 in UFW..."
    sudo ufw allow 3768/tcp
    sudo ufw reload
fi

# 5. Launch / Restart application with PM2
echo "[4/4] Starting app on port 3768 with PM2..."
PORT=3768 pm2 delete ecell-agent 2>/dev/null || true
PORT=3768 pm2 start server/index.js --name "ecell-agent"
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

echo "======================================================="
echo "✅ Deployed successfully!"
echo "🌐 Web App URL: http://13.233.76.8:3768"
echo "======================================================="
pm2 status
