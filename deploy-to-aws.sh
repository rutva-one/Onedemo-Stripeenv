#!/bin/bash

# One Card Demo - AWS EC2 Deployment Script
# This script automates the deployment of both frontend and backend to AWS EC2

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/Backend"
FRONTEND_DIR="$PROJECT_DIR/Frontend"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   One Card Demo - AWS EC2 Deployment${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check if required parameters are provided
if [ $# -lt 2 ]; then
    echo -e "${RED}Usage: $0 <EC2_IP_ADDRESS> <PATH_TO_PEM_KEY>${NC}"
    echo -e "${YELLOW}Example: $0 54.123.45.67 ~/aws-keys/onecard-key.pem${NC}"
    exit 1
fi

EC2_IP=$1
PEM_KEY=$2
EC2_USER="ubuntu"

# Validate PEM key exists
if [ ! -f "$PEM_KEY" ]; then
    echo -e "${RED}Error: PEM key file not found at $PEM_KEY${NC}"
    exit 1
fi

# Set correct permissions on PEM key
chmod 400 "$PEM_KEY"

echo -e "${GREEN}✓${NC} Configuration validated"
echo -e "  EC2 IP: ${BLUE}$EC2_IP${NC}"
echo -e "  PEM Key: ${BLUE}$PEM_KEY${NC}\n"

# Test SSH connection
echo -e "${YELLOW}Testing SSH connection...${NC}"
if ! ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$EC2_USER@$EC2_IP" "echo 'SSH connection successful'" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to EC2 instance${NC}"
    echo -e "${YELLOW}Please check:${NC}"
    echo -e "  1. EC2 instance is running"
    echo -e "  2. Security group allows SSH (port 22) from your IP"
    echo -e "  3. PEM key is correct"
    exit 1
fi
echo -e "${GREEN}✓${NC} SSH connection successful\n"

# Step 1: Install dependencies on EC2
echo -e "${YELLOW}Step 1/6: Installing dependencies on EC2...${NC}"
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" << 'EOF'
    set -e

    # Update system
    echo "Updating system packages..."
    sudo apt update -qq

    # Install Node.js if not installed
    if ! command -v node &> /dev/null; then
        echo "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    fi

    # Install Nginx if not installed
    if ! command -v nginx &> /dev/null; then
        echo "Installing Nginx..."
        sudo apt install -y nginx
    fi

    # Install PM2 if not installed
    if ! command -v pm2 &> /dev/null; then
        echo "Installing PM2..."
        sudo npm install -g pm2
    fi

    echo "✓ All dependencies installed"
    echo "Node version: $(node --version)"
    echo "NPM version: $(npm --version)"
    echo "Nginx version: $(nginx -v 2>&1)"
    echo "PM2 version: $(pm2 --version)"
EOF
echo -e "${GREEN}✓${NC} Dependencies installed\n"

# Step 2: Upload backend files
echo -e "${YELLOW}Step 2/6: Uploading backend files...${NC}"
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" "mkdir -p ~/Backend"
rsync -avz --progress -e "ssh -i $PEM_KEY" \
    --exclude 'node_modules' \
    --exclude 'server.log' \
    --exclude '.git' \
    "$BACKEND_DIR/" "$EC2_USER@$EC2_IP:~/Backend/"
echo -e "${GREEN}✓${NC} Backend files uploaded\n"

# Step 3: Setup backend
echo -e "${YELLOW}Step 3/6: Setting up backend...${NC}"
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" << 'EOF'
    set -e
    cd ~/Backend

    # Install dependencies
    echo "Installing backend dependencies..."
    npm install --production

    # Stop existing PM2 process if running
    pm2 delete onecard-backend 2>/dev/null || true

    # Start backend with PM2
    echo "Starting backend with PM2..."
    pm2 start server.js --name onecard-backend
    pm2 save

    # Setup PM2 to start on system boot
    sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

    echo "✓ Backend setup complete"
    pm2 status
EOF
echo -e "${GREEN}✓${NC} Backend configured and running\n"

# Step 4: Upload frontend files
echo -e "${YELLOW}Step 4/6: Uploading frontend files...${NC}"
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" "mkdir -p ~/Frontend"
rsync -avz --progress -e "ssh -i $PEM_KEY" \
    --exclude '.git' \
    "$FRONTEND_DIR/" "$EC2_USER@$EC2_IP:~/Frontend/"
echo -e "${GREEN}✓${NC} Frontend files uploaded\n"

# Step 5: Configure Nginx
echo -e "${YELLOW}Step 5/6: Configuring Nginx...${NC}"
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" << 'EOF'
    set -e

    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/onecard > /dev/null << 'NGINXCONF'
server {
    listen 80;
    server_name _;

    # Serve frontend from root
    location / {
        root /home/ubuntu/Frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Also serve frontend from /demo path
    location /demo {
        alias /home/ubuntu/Frontend;
        index index.html;
        try_files $uri $uri/ /demo/index.html;
    }

    # Backend API endpoints
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Stripe webhook endpoint (direct, not under /api)
    location /webhook {
        proxy_pass http://localhost:3000/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }
}
NGINXCONF

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/onecard /etc/nginx/sites-enabled/

    # Remove default site
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test Nginx configuration
    sudo nginx -t

    # Restart Nginx
    sudo systemctl restart nginx

    echo "✓ Nginx configured and restarted"
EOF
echo -e "${GREEN}✓${NC} Nginx configured\n"

# Step 6: Verify deployment
echo -e "${YELLOW}Step 6/6: Verifying deployment...${NC}"
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" << 'EOF'
    set -e

    echo "Backend status:"
    pm2 status

    echo ""
    echo "Nginx status:"
    sudo systemctl status nginx --no-pager | head -5

    echo ""
    echo "Backend health check:"
    sleep 2  # Give backend a moment to start
    curl -s http://localhost:3000/health || echo "Backend health check endpoint not available"
EOF
echo -e "${GREEN}✓${NC} Deployment verification complete\n"

# Final information
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}   Deployment Successful!${NC}"
echo -e "${BLUE}================================================${NC}\n"
echo -e "${GREEN}Your demo is now accessible at:${NC}"
echo -e "  ${BLUE}http://$EC2_IP${NC}"
echo -e "  ${BLUE}http://$EC2_IP/demo${NC}\n"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Configure your domain (theonecard.ai) to point to: ${BLUE}$EC2_IP${NC}"
echo -e "  2. After DNS propagation, install SSL certificate:"
echo -e "     ${BLUE}ssh -i $PEM_KEY $EC2_USER@$EC2_IP${NC}"
echo -e "     ${BLUE}sudo apt install certbot python3-certbot-nginx${NC}"
echo -e "     ${BLUE}sudo certbot --nginx -d theonecard.ai -d www.theonecard.ai${NC}"
echo -e "  3. Update Stripe webhook URL to: ${BLUE}https://theonecard.ai/webhook${NC}\n"
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View backend logs: ${BLUE}ssh -i $PEM_KEY $EC2_USER@$EC2_IP 'pm2 logs onecard-backend'${NC}"
echo -e "  Restart backend: ${BLUE}ssh -i $PEM_KEY $EC2_USER@$EC2_IP 'pm2 restart onecard-backend'${NC}"
echo -e "  View Nginx logs: ${BLUE}ssh -i $PEM_KEY $EC2_USER@$EC2_IP 'sudo tail -f /var/log/nginx/error.log'${NC}\n"
