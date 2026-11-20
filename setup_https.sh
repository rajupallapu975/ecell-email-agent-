#!/bin/bash
set -e

echo "=========================================================="
echo "🔒 Setting up HTTPS for email-agent.duckdns.org"
echo "=========================================================="

DOMAIN="email-agent.duckdns.org"

# 1. Update packages and install certbot
echo "--> Installing Certbot & Nginx plugin..."
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx nginx

# 2. Update code from GitHub
if [ ! -d "$HOME/ecell-email-agent-/.git" ]; then
  git clone https://github.com/rajupallapu975/ecell-email-agent-.git "$HOME/ecell-email-agent-"
fi

cd "$HOME/ecell-email-agent-"
git fetch origin main
git reset --hard origin/main

# Sync to ~/ecell_agent if present
for dir in "$HOME/ecell_agent" "/home/ubuntu/ecell_agent"; do
  if [ -d "$dir" ]; then
    echo "Syncing updated public assets to $dir..."
    cp -r "$HOME/ecell-email-agent-/public" "$dir/"
    cp -r "$HOME/ecell-email-agent-/server" "$dir/" 2>/dev/null || true
  fi
done

# Configure Node to internal port 3000 so Nginx can proxy to it
if [ -f .env ]; then
  sed -i 's/^PORT=.*/PORT=3000/' .env
  sed -i 's|^GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://email-agent.duckdns.org/api/auth/google/callback|' .env
elif [ -f "$HOME/ecell_agent/.env" ]; then
  sed -i 's/^PORT=.*/PORT=3000/' "$HOME/ecell_agent/.env"
  sed -i 's|^GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://email-agent.duckdns.org/api/auth/google/callback|' "$HOME/ecell_agent/.env"
fi

pm2 restart all || true

# 3. Request SSL certificate via Certbot
echo "--> Requesting SSL certificate from Let's Encrypt for $DOMAIN..."
sudo certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || \
sudo certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email

# 4. Create Nginx SSL configuration
echo "--> Creating Nginx reverse-proxy configuration..."
sudo tee /etc/nginx/conf.d/email-agent.conf << 'EOF'
server {
    listen 443 ssl;
    listen 3768 ssl;
    server_name email-agent.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/email-agent.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/email-agent.duckdns.org/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

# 5. Test & reload Nginx
echo "--> Validating and reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "=========================================================="
echo "✅ HTTPS IS FULLY CONFIGURED!"
echo "Open in your browser on phone or PC:"
echo "👉 https://email-agent.duckdns.org"
echo "=========================================================="
