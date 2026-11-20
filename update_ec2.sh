#!/bin/bash
set -e

echo "=========================================================="
echo "🔄 Updating E-Cell Mail Agent on EC2"
echo "=========================================================="

# 1. Ensure latest clone exists in $HOME/ecell-email-agent-
if [ ! -d "$HOME/ecell-email-agent-/.git" ]; then
  echo "Cloning repository from GitHub..."
  git clone https://github.com/rajupallapu975/ecell-email-agent-.git "$HOME/ecell-email-agent-"
fi

cd "$HOME/ecell-email-agent-"
echo "Pulling latest code from origin/main..."
git fetch origin main
git reset --hard origin/main

# 2. Sync to any legacy directories (e.g. ~/ecell_agent) where PM2 might be running
for dir in "$HOME/ecell_agent" "/home/ubuntu/ecell_agent"; do
  if [ -d "$dir" ]; then
    echo "Updating existing files in $dir..."
    cp -r "$HOME/ecell-email-agent-/public" "$dir/"
    cp -r "$HOME/ecell-email-agent-/server" "$dir/" 2>/dev/null || true
  fi
done

# 3. Restart PM2 to serve updated assets
echo "Restarting PM2..."
pm2 restart all || pm2 restart ecell-agent || true

echo "=========================================================="
echo "✅ Code update complete!"
echo "=========================================================="
