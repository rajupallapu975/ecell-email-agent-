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

# 2. Pull latest code from GitHub
PROJECT_DIR=""
if [ -d "$HOME/ecell-email-agent-" ]; then
  PROJECT_DIR="$HOME/ecell-email-agent-"
elif [ -d "/home/ubuntu/ecell-email-agent-" ]; then
  PROJECT_DIR="/home/ubuntu/ecell-email-agent-"
fi

if [ -n "$PROJECT_DIR" ]; then
  echo "--> Pulling latest code in $PROJECT_DIR..."
  cd "$PROJECT_DIR"
  git pull origin main || true
  
  # Configure Node to internal port 3000 so Nginx can proxy to it
  if [ -f .env ]; then
    sed -i 's/^PORT=.*/PORT=3000/' .env
    sed -i 's|^GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://email-agent.duckdns.org/api/auth/google/callback|' .env
  else
    echo "PORT=3000" >> .env
    echo "GOOGLE_REDIRECT_URI=https://email-agent.duckdns.org/api/auth/google/callback" >> .env
  fi
  pm2 restart ecell-agent --update-env || pm2 start server/index.js --name ecell-agent
fi

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
echo "✅ HTTPS IS NOW FULLY ACTIVE!"
echo "Open your browser on mobile or desktop:"
echo "👉 https://email-agent.duckdns.org"
echo "👉 https://email-agent.duckdns.org:3768"
echo "=========================================================="
