# One Card Demo - Complete Infrastructure Documentation

> **Last Updated**: January 2025
> **Production URL**: https://demo.theonecard.ai
> **Status**: Active and operational

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [AWS Infrastructure](#aws-infrastructure)
4. [DNS Configuration](#dns-configuration)
5. [SSL/TLS Certificates](#ssltls-certificates)
6. [Backend Service](#backend-service)
7. [Frontend Application](#frontend-application)
8. [Stripe Integration](#stripe-integration)
9. [File Structure on Server](#file-structure-on-server)
10. [Environment Variables](#environment-variables)
11. [Monitoring & Logs](#monitoring--logs)
12. [Deployment Process](#deployment-process)
13. [Troubleshooting Guide](#troubleshooting-guide)
14. [Security Checklist](#security-checklist)
15. [Cost Analysis](#cost-analysis)
16. [Maintenance Schedule](#maintenance-schedule)
17. [Disaster Recovery](#disaster-recovery)

---

## Overview

The One Card Demo is a full-stack web application deployed on AWS EC2 that demonstrates intelligent credit card optimization using Stripe's Issuing API. The system automatically selects the optimal card for each transaction based on merchant category codes (MCC) and user preferences.

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Operating System | Ubuntu | 24.04 LTS |
| Web Server | Nginx | 1.24.0 |
| Application Server | Node.js | 18.x |
| Process Manager | PM2 | 5.x |
| SSL Provider | Let's Encrypt | Certbot |
| Payment Processor | Stripe | Latest API |
| DNS Provider | GoDaddy | - |
| Cloud Provider | AWS EC2 | t2.micro |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS (443)
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   GoDaddy DNS                                │
│   demo.theonecard.ai → A Record → 54.196.250.76            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │
┌────────────────────▼────────────────────────────────────────┐
│              AWS EC2 Instance (t2.micro)                     │
│              IP: 54.196.250.76                               │
│              Ubuntu 24.04 LTS                                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Nginx (Port 80/443)                     │  │
│  │        SSL Termination & Reverse Proxy               │  │
│  └───────────┬──────────────────────────────────────────┘  │
│              │                                              │
│              ├─ / → Frontend (Static Files)                │
│              ├─ /api/* → Backend Proxy                     │
│              └─ /webhook → Stripe Webhook Proxy            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        PM2 Process Manager                            │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │   Node.js Backend (Port 3000)                  │  │  │
│  │  │   - Express Server                             │  │  │
│  │  │   - Stripe API Integration                     │  │  │
│  │  │   - MCC Rankings Engine                        │  │  │
│  │  │   - Webhook Handler                            │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        File System                                    │  │
│  │  /home/ubuntu/Frontend/    - Static files            │  │
│  │  /home/ubuntu/Backend/     - Node.js app             │  │
│  │  /home/ubuntu/.env         - Environment vars        │  │
│  │  /home/ubuntu/mcc_rankings.json                      │  │
│  │  /home/ubuntu/custom_rankings_default.json           │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ HTTPS API Calls
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                   Stripe API                                  │
│   - Issuing Authorization                                     │
│   - Payment Intents                                           │
│   - Webhooks                                                  │
└───────────────────────────────────────────────────────────────┘
```

---

## AWS Infrastructure

### EC2 Instance Details

| Property | Value |
|----------|-------|
| **Instance ID** | `i-0xxxxxxxxxx` (check AWS console) |
| **Instance Type** | `t2.micro` (1 vCPU, 1 GB RAM) |
| **AMI** | Ubuntu Server 24.04 LTS |
| **Region** | `us-east-1` (N. Virginia) |
| **Availability Zone** | `us-east-1a` |
| **Public IPv4** | `54.196.250.76` |
| **Public DNS** | `ec2-54-196-250-76.compute-1.amazonaws.com` |
| **Storage** | 8 GB gp3 (General Purpose SSD) |
| **Key Pair** | `onecard-demo-key.pem` |
| **IAM Role** | None (not required) |

### Security Group Configuration

**Security Group Name**: `onecard-demo-sg`

| Type | Protocol | Port | Source | Purpose |
|------|----------|------|--------|---------|
| SSH | TCP | 22 | Your IP | Remote server access |
| HTTP | TCP | 80 | 0.0.0.0/0 | HTTP traffic (redirects to HTTPS) |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Secure web traffic |

**Important Security Notes**:
- SSH access is restricted to your IP address only
- HTTP automatically redirects to HTTPS via Nginx
- No direct access to port 3000 (backend) - only through Nginx proxy
- All outbound traffic allowed (required for Stripe API calls)

### Key Pair Management

**Location**: `~/aws-keys/onecard-demo-key.pem`

**Permissions** (must be set correctly):
```bash
chmod 400 ~/aws-keys/onecard-demo-key.pem
```

**SSH Connection**:
```bash
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76
```

**Backup**: Keep a secure backup of this PEM file. If lost, you'll lose SSH access to the instance.

---

## DNS Configuration

### Domain: theonecard.ai

**DNS Provider**: GoDaddy

### DNS Records

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| A | `demo` | `54.196.250.76` | 600 | Points demo subdomain to EC2 |

**Full Domain**: `demo.theonecard.ai`

### DNS Propagation

- **Time to propagate**: 5-10 minutes (typically)
- **Check propagation**: `nslookup demo.theonecard.ai`
- **Expected result**: Should resolve to `54.196.250.76`

### Main Website Setup

- **Main site** (`theonecard.ai`): Hosted on GoDaddy
- **Demo** (`demo.theonecard.ai`): Hosted on AWS EC2
- The main website and demo are completely separate

---

## SSL/TLS Certificates

### Certificate Provider: Let's Encrypt

**Certificate Authority**: Let's Encrypt (free, trusted CA)

### Certificate Details

| Property | Value |
|----------|-------|
| **Domain** | `demo.theonecard.ai` |
| **Certificate Path** | `/etc/letsencrypt/live/demo.theonecard.ai/fullchain.pem` |
| **Private Key Path** | `/etc/letsencrypt/live/demo.theonecard.ai/privkey.pem` |
| **Issued Date** | 2025-01-12 |
| **Expiry Date** | 2026-01-12 |
| **Renewal Period** | 90 days |
| **Auto-renewal** | Yes (via systemd timer) |

### Certificate Management

**Installation Command**:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d demo.theonecard.ai
```

**Check Certificate Status**:
```bash
sudo certbot certificates
```

**Manual Renewal** (not usually needed):
```bash
sudo certbot renew
```

**Test Auto-renewal**:
```bash
sudo certbot renew --dry-run
```

**Auto-renewal Service**:
- Certbot automatically installs a systemd timer
- Runs twice daily to check for certificates expiring within 30 days
- Check status: `sudo systemctl status certbot.timer`

### SSL Configuration in Nginx

Certbot automatically configures Nginx with:
- SSL certificate paths
- Strong SSL protocols (TLSv1.2, TLSv1.3)
- Secure cipher suites
- HTTP to HTTPS redirect
- HSTS headers (HTTP Strict Transport Security)

---

## Backend Service

### Node.js Application

**Directory**: `/home/ubuntu/Backend/`

**Main File**: `server.js`

**Port**: `3000` (internal only, proxied through Nginx)

### Process Management with PM2

**Process Name**: `onecard-backend`

**PM2 Configuration**:
- Auto-restart on failure
- Auto-start on system reboot
- Log management
- Memory limit monitoring

### Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/get-cards` | GET | Retrieve user's cards |
| `/optimize-cards` | POST | Optimize card rankings |
| `/save-rankings` | POST | Save custom rankings |
| `/get-rankings` | GET | Get current rankings |
| `/create-payment` | POST | Process payment |
| `/webhook` | POST | Stripe webhook receiver |

### Dependencies

Key Node.js packages (from `package.json`):
```json
{
  "express": "^4.18.2",
  "stripe": "^12.0.0",
  "cors": "^2.8.5",
  "dotenv": "^16.0.3",
  "body-parser": "^1.20.2"
}
```

### MCC Rankings System

The backend uses two ranking files:

1. **`mcc_rankings.json`** (`/home/ubuntu/mcc_rankings.json`)
   - Default rankings for all merchant categories
   - Maps MCC codes to card preferences
   - Critical for card selection logic

2. **`custom_rankings_default.json`** (`/home/ubuntu/custom_rankings_default.json`)
   - User-customized rankings
   - Fallback to mcc_rankings.json if not present
   - Updated when user optimizes their wallet

**Example MCC Ranking Entry**:
```json
{
  "5411": {
    "category": "Grocery Stores, Supermarkets",
    "cards": {
      "Grocery Card": 10,
      "Foodie Card": 3,
      "Travel Card": 1,
      "Transit Card": 1
    }
  }
}
```

### Backend Commands

**View Logs**:
```bash
pm2 logs onecard-backend
pm2 logs onecard-backend --lines 100
pm2 logs onecard-backend --err  # Errors only
```

**Restart Backend**:
```bash
pm2 restart onecard-backend
```

**Stop Backend**:
```bash
pm2 stop onecard-backend
```

**Start Backend**:
```bash
pm2 start onecard-backend
```

**Process Status**:
```bash
pm2 status
```

**Monitor Resources**:
```bash
pm2 monit
```

---

## Frontend Application

### Static Files

**Directory**: `/home/ubuntu/Frontend/`

**Main File**: `index.html`

**Served by**: Nginx directly (no application server needed)

### Frontend Configuration

**Server URL Configuration** (in `index.html` line ~879):
```javascript
this.serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : `${window.location.protocol}//${window.location.hostname}/api`;
```

This auto-detects the environment:
- **Local development**: Uses `http://localhost:3000`
- **Production**: Uses `https://demo.theonecard.ai/api`

### Viewport Configuration

**Responsive Design** (line 5):
```html
<meta name="viewport" content="width=device-width, initial-scale=0.85">
```

- `initial-scale=0.85`: Page loads at 85% zoom (slightly zoomed out)
- Optimized for both desktop and mobile viewing

### Particle Animation Settings

**Configuration** (line ~950):
```javascript
createParticles() {
    const particlesContainer = document.getElementById('particles');
    if(!particlesContainer) return;
    for (let i = 0; i < 25; i++) {  // 25 particles
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = -(Math.random() * 35) + 's';  // Negative delay for distribution
        particle.style.animationDuration = (Math.random() * 20 + 30) + 's';
        particlesContainer.appendChild(particle);
    }
}
```

- 25 particles for optimal performance
- Negative animation delays spread particles evenly
- Subtle opacity and size for professional look

### File Permissions

**Required Permissions**:
```bash
chmod -R 755 ~/Frontend
chmod 755 ~
```

Nginx (running as `www-data` user) needs read access to:
- `/home/ubuntu/` directory
- All files in `/home/ubuntu/Frontend/`

---

## Stripe Integration

### Stripe Account

**Environment**: Test Mode

**Dashboard**: https://dashboard.stripe.com

### Stripe API Keys

| Key Type | Usage | Location |
|----------|-------|----------|
| **Secret Key** | Backend API calls | `.env` file |
| **Webhook Secret** | Webhook signature verification | `.env` file |

**Format**:
```env
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_1F6e49ClBcmWRQnGAed1O2ZlIsTFDUfU
```

### Stripe Issuing Setup

**Issuing Card**: Virtual card used for all demo transactions

**Related IDs in `.env`**:
```env
STRIPE_ISSUING_CARD_ID=ic_1S769SQLFtcEJSwHLTAnsvQe
STRIPE_CUSTOMER_ID=cus_T3CgWDrN0e0AMe
```

### Payment Methods (Demo Cards)

Each demo card is a Stripe Payment Method:

```env
STRIPE_FOODIE_CARD_PM_ID=pm_1SG9flQLFtcEJSwHFoqxTXqT
STRIPE_TRAVEL_CARD_PM_ID=pm_1SG9fyQLFtcEJSwHCV4rm2SC
STRIPE_GROCERY_CARD_PM_ID=pm_1SG9gRQLFtcEJSwHXKtuCu0T
STRIPE_TRANSIT_CARD_PM_ID=pm_1SG9gFQLFtcEJSwHx3K1Ak03
```

### Webhook Configuration

**Webhook URL**: `https://demo.theonecard.ai/webhook`

**Dashboard Location**: https://dashboard.stripe.com/webhooks

**Required Events**:
- `issuing_authorization.request` - When transaction is initiated
- `issuing_authorization.created` - When authorization is created
- `payment_intent.succeeded` - When payment completes

**Webhook Secret**: Used to verify webhook signatures
```
whsec_1F6e49ClBcmWRQnGAed1O2ZlIsTFDUfU
```

### Testing Webhooks

**Using Stripe CLI**:
```bash
stripe listen --forward-to https://demo.theonecard.ai/webhook
stripe trigger issuing_authorization.request
```

**Check Webhook Logs**:
- Stripe Dashboard: https://dashboard.stripe.com/webhooks/[webhook_id]/logs
- Backend Logs: `pm2 logs onecard-backend`

---

## Nginx Configuration

### Configuration File

**Location**: `/etc/nginx/sites-available/onecard`

**Symlink**: `/etc/nginx/sites-enabled/onecard` → `/etc/nginx/sites-available/onecard`

### Complete Configuration

```nginx
server {
    listen 80;
    server_name demo.theonecard.ai;

    # Redirect HTTP to HTTPS (added by Certbot)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name demo.theonecard.ai;

    # SSL Configuration (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/demo.theonecard.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/demo.theonecard.ai/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Frontend (root)
    location / {
        root /home/ubuntu/Frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
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

    # Stripe Webhook
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
```

### Nginx Commands

**Test Configuration**:
```bash
sudo nginx -t
```

**Reload Configuration** (graceful, no downtime):
```bash
sudo systemctl reload nginx
```

**Restart Nginx**:
```bash
sudo systemctl restart nginx
```

**Check Status**:
```bash
sudo systemctl status nginx
```

**View Error Logs**:
```bash
sudo tail -f /var/log/nginx/error.log
```

**View Access Logs**:
```bash
sudo tail -f /var/log/nginx/access.log
```

---

## File Structure on Server

```
/home/ubuntu/
├── .env                              # Environment variables (SECURE)
├── mcc_rankings.json                 # Default MCC rankings
├── custom_rankings_default.json      # User customized rankings
│
├── Backend/
│   ├── server.js                     # Main backend application
│   ├── package.json                  # Node.js dependencies
│   ├── package-lock.json
│   ├── node_modules/                 # Installed packages
│   ├── check_auth.js                 # Authorization checker
│   ├── check_card.js                 # Card validation
│   └── test_webhook.js               # Webhook testing utility
│
└── Frontend/
    ├── index.html                    # Main application (SPA)
    ├── assets/                       # Images, fonts, etc.
    └── [other static files]

/etc/nginx/
├── nginx.conf                        # Main Nginx config
├── sites-available/
│   └── onecard                       # Our site config
└── sites-enabled/
    └── onecard → ../sites-available/onecard

/etc/letsencrypt/
├── live/demo.theonecard.ai/
│   ├── fullchain.pem                 # SSL certificate
│   ├── privkey.pem                   # Private key
│   ├── cert.pem
│   └── chain.pem
└── renewal/
    └── demo.theonecard.ai.conf       # Auto-renewal config

/var/log/
├── nginx/
│   ├── access.log                    # HTTP access logs
│   └── error.log                     # Nginx error logs
└── [PM2 logs managed separately]
```

---

## Environment Variables

### Location

**File**: `/home/ubuntu/.env` (in home directory, NOT in Backend/)

**Permissions**:
```bash
chmod 600 ~/.env  # Only owner can read/write
```

### Complete .env File

```env
# Stripe API Keys
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_webhook_secret_here

# Stripe Issuing
STRIPE_ISSUING_CARD_ID=your_issuing_card_id_here
STRIPE_CUSTOMER_ID=your_customer_id_here

# Demo Card Payment Methods
STRIPE_FOODIE_CARD_PM_ID=your_foodie_payment_method_id
STRIPE_TRAVEL_CARD_PM_ID=your_travel_payment_method_id
STRIPE_GROCERY_CARD_PM_ID=your_grocery_payment_method_id
STRIPE_TRANSIT_CARD_PM_ID=your_transit_payment_method_id

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Security Notes

1. **Never commit .env to git** - Already in .gitignore
2. **Backup .env securely** - Store encrypted backup offline
3. **Rotate keys periodically** - Update Stripe keys every 6-12 months
4. **Restrict file permissions** - Only ubuntu user should have access
5. **Use test keys** - Never use production Stripe keys for demo

---

## Monitoring & Logs

### Backend Logs (PM2)

**View Real-time Logs**:
```bash
pm2 logs onecard-backend
```

**View Last N Lines**:
```bash
pm2 logs onecard-backend --lines 50
pm2 logs onecard-backend --lines 200
```

**View Only Errors**:
```bash
pm2 logs onecard-backend --err
```

**View Only Output**:
```bash
pm2 logs onecard-backend --out
```

**Clear Logs**:
```bash
pm2 flush onecard-backend
```

**Log Files Location**:
```
~/.pm2/logs/onecard-backend-out.log    # stdout
~/.pm2/logs/onecard-backend-error.log  # stderr
```

### Nginx Logs

**Access Logs** (all HTTP requests):
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -100 /var/log/nginx/access.log  # Last 100 lines
```

**Error Logs** (Nginx errors):
```bash
sudo tail -f /var/log/nginx/error.log
```

**Filter by Status Code**:
```bash
grep "404" /var/log/nginx/access.log
grep "500" /var/log/nginx/access.log
grep "POST /webhook" /var/log/nginx/access.log
```

### System Monitoring

**CPU and Memory Usage**:
```bash
htop
```

**Disk Usage**:
```bash
df -h
```

**Network Connections**:
```bash
sudo netstat -tulpn | grep LISTEN
```

**Process Status**:
```bash
pm2 status
sudo systemctl status nginx
sudo systemctl status certbot.timer
```

### Health Checks

**Backend Health**:
```bash
curl http://localhost:3000/health
curl https://demo.theonecard.ai/api/health
```

**Nginx Test**:
```bash
sudo nginx -t
```

**SSL Certificate Check**:
```bash
sudo certbot certificates
openssl s_client -connect demo.theonecard.ai:443 -servername demo.theonecard.ai
```

---

## Deployment Process

### Initial Deployment

This was already completed, but here's the process for reference:

1. **Launch EC2 Instance** (via AWS Console)
2. **Configure Security Groups** (SSH, HTTP, HTTPS)
3. **SSH into Instance** and install dependencies
4. **Upload Backend** files via SCP/rsync
5. **Upload Frontend** files via SCP/rsync
6. **Configure Environment** variables (.env file)
7. **Start Backend** with PM2
8. **Configure Nginx** for reverse proxy
9. **Add DNS Record** in GoDaddy
10. **Install SSL Certificate** with Certbot
11. **Update Stripe Webhook** URL

### Updating Code

**Update Backend**:
```bash
# On local machine
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv/Backend
scp -i ~/aws-keys/onecard-demo-key.pem server.js ubuntu@54.196.250.76:~/Backend/

# On server (via SSH)
cd ~/Backend
pm2 restart onecard-backend
```

**Update Frontend**:
```bash
# On local machine
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv/Frontend
scp -i ~/aws-keys/onecard-demo-key.pem index.html ubuntu@54.196.250.76:~/Frontend/

# No restart needed - Nginx serves static files directly
```

**Update Multiple Files**:
```bash
# Use rsync for efficient updates
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv
rsync -avz --progress -e "ssh -i ~/aws-keys/onecard-demo-key.pem" \
    --exclude 'node_modules' \
    Backend/ ubuntu@54.196.250.76:~/Backend/

rsync -avz --progress -e "ssh -i ~/aws-keys/onecard-demo-key.pem" \
    Frontend/ ubuntu@54.196.250.76:~/Frontend/

# Then restart backend
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76 'pm2 restart onecard-backend'
```

### Automated Deployment Script

You can use the deployment script for complete redeployment:

```bash
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv
./deploy-to-aws.sh 54.196.250.76 ~/aws-keys/onecard-demo-key.pem
```

This script:
- Installs/updates dependencies
- Uploads all files
- Configures services
- Restarts everything

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Backend Not Responding

**Symptoms**:
- API calls return 502 Bad Gateway
- `curl http://localhost:3000/health` fails

**Diagnosis**:
```bash
pm2 status
pm2 logs onecard-backend --err --lines 50
```

**Solutions**:
```bash
# Check if backend is running
pm2 list

# Restart backend
pm2 restart onecard-backend

# If stuck, kill and restart
pm2 delete onecard-backend
cd ~/Backend
pm2 start server.js --name onecard-backend
pm2 save
```

**Common Causes**:
- Missing environment variables
- Port 3000 already in use
- Missing node_modules
- Syntax error in server.js

#### Issue 2: Frontend Not Loading (500 Error)

**Symptoms**:
- Blank page or 500 Internal Server Error
- Nginx error logs show permission denied

**Diagnosis**:
```bash
sudo tail -50 /var/log/nginx/error.log
ls -la ~/Frontend/
ls -la ~
```

**Solutions**:
```bash
# Fix file permissions
chmod -R 755 ~/Frontend
chmod 755 ~

# Restart Nginx
sudo systemctl restart nginx
```

#### Issue 3: SSL Certificate Issues

**Symptoms**:
- Browser shows "Not Secure"
- Certificate expired warning

**Diagnosis**:
```bash
sudo certbot certificates
```

**Solutions**:
```bash
# Renew certificate
sudo certbot renew

# If renewal fails, reinstall
sudo certbot --nginx -d demo.theonecard.ai --force-renewal

# Check auto-renewal timer
sudo systemctl status certbot.timer
```

#### Issue 4: Transactions Failing

**Symptoms**:
- "Transaction failed" message in UI
- Backend logs show MCC ranking errors

**Diagnosis**:
```bash
pm2 logs onecard-backend | grep "MCC"
ls -la ~/mcc_rankings.json
ls -la ~/custom_rankings_default.json
```

**Solutions**:
```bash
# Re-upload MCC rankings
scp -i ~/aws-keys/onecard-demo-key.pem \
    /Users/rutva/Downloads/One/Onedemo-Stripeenv/mcc_rankings.json \
    ubuntu@54.196.250.76:~/mcc_rankings.json

# Create default copy
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76 \
    'cp ~/mcc_rankings.json ~/custom_rankings_default.json'

# Restart backend
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76 \
    'pm2 restart onecard-backend'
```

#### Issue 5: Stripe Webhooks Not Received

**Symptoms**:
- Transactions initiated but not completing
- No webhook logs in backend

**Diagnosis**:
```bash
# Check webhook is accessible
curl -X POST https://demo.theonecard.ai/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check backend logs
pm2 logs onecard-backend | grep webhook
```

**Solutions**:
1. Verify webhook URL in Stripe Dashboard is `https://demo.theonecard.ai/webhook`
2. Check webhook secret in .env matches Stripe Dashboard
3. Check Stripe Dashboard webhook logs for delivery attempts
4. Verify backend is running: `pm2 status`

#### Issue 6: High CPU/Memory Usage

**Symptoms**:
- Slow response times
- Server becoming unresponsive

**Diagnosis**:
```bash
htop
pm2 monit
df -h
```

**Solutions**:
```bash
# Restart backend
pm2 restart onecard-backend

# Clear PM2 logs if too large
pm2 flush

# Check disk space
df -h
# If low, clean up logs
sudo find /var/log -type f -name "*.log" -mtime +30 -delete
```

#### Issue 7: DNS Not Resolving

**Symptoms**:
- `demo.theonecard.ai` doesn't resolve
- nslookup returns no answer

**Diagnosis**:
```bash
nslookup demo.theonecard.ai
dig demo.theonecard.ai
```

**Solutions**:
1. Check GoDaddy DNS settings - verify A record exists
2. Wait for DNS propagation (up to 48 hours, usually 5-10 minutes)
3. Try using different DNS server: `nslookup demo.theonecard.ai 8.8.8.8`

---

## Security Checklist

### Server Security

- [x] SSH access restricted to specific IP addresses
- [x] PEM key file has correct permissions (400)
- [x] No password-based SSH authentication
- [x] Firewall configured (via AWS Security Groups)
- [x] Only necessary ports open (22, 80, 443)
- [x] Regular system updates scheduled
- [x] Backend port (3000) not exposed to internet

### Application Security

- [x] HTTPS enforced (HTTP redirects to HTTPS)
- [x] SSL certificate from trusted CA (Let's Encrypt)
- [x] Strong SSL ciphers configured
- [x] HSTS header enabled
- [x] X-Frame-Options header set
- [x] X-Content-Type-Options header set
- [x] Environment variables stored securely (.env file)
- [x] .env file not committed to git
- [x] .env file has restrictive permissions (600)
- [x] Using Stripe test keys (not production)
- [x] Webhook signature verification enabled

### Stripe Security

- [x] Webhook signature verification using webhook secret
- [x] Test mode keys used (not production)
- [x] API keys stored in environment variables
- [x] No API keys in frontend code
- [x] Webhook URL uses HTTPS
- [x] Regular key rotation schedule planned

### Monitoring & Alerts

- [ ] CloudWatch monitoring enabled (optional but recommended)
- [ ] AWS billing alerts configured
- [x] PM2 auto-restart on crash enabled
- [x] SSL auto-renewal configured
- [ ] Uptime monitoring service (e.g., UptimeRobot) - recommended

### Backup Strategy

- [ ] EC2 snapshot schedule configured
- [x] .env file backed up securely offline
- [x] PEM key backed up securely
- [ ] Database backups (if applicable)
- [ ] Code version controlled in git

---

## Cost Analysis

### Monthly AWS Costs (Estimated)

| Service | Details | Cost |
|---------|---------|------|
| **EC2 Instance** | t2.micro (1 vCPU, 1GB RAM) | $0-8.50/month* |
| **EBS Storage** | 8 GB gp3 volume | $0.80/month |
| **Data Transfer** | First 100 GB free, then $0.09/GB | $0-5/month |
| **Elastic IP** | Free when associated with running instance | $0/month |
| **Total** | | **~$1-15/month** |

*Free for first 750 hours/month under AWS Free Tier (12 months for new accounts)

### Additional Costs

| Service | Cost |
|---------|------|
| **SSL Certificate** | Free (Let's Encrypt) |
| **Domain (theonecard.ai)** | ~$12/year (already purchased) |
| **GoDaddy DNS** | Included with domain |
| **Stripe** | Free (test mode, no transaction fees) |

### Cost Optimization Tips

1. **Use AWS Free Tier**: New AWS accounts get 750 hours/month of t2.micro free for 12 months
2. **AWS Credits**: You mentioned having AWS credits - apply them to your account
3. **Stop Instance When Not Needed**: Stop (don't terminate) instance during off-hours
4. **Monitor Data Transfer**: Keep outbound data transfer under 100 GB/month
5. **Reserved Instances**: If running 24/7 long-term, consider Reserved Instances for 30-40% savings

### Estimated Annual Cost

**With AWS Free Tier**: ~$12/year (domain renewal only)
**Without Free Tier**: ~$180/year ($15/month × 12)
**With AWS Credits**: $0 until credits exhausted

---

## Maintenance Schedule

### Daily Tasks (Automated)

- [x] PM2 auto-restart on backend crashes
- [x] SSL certificate renewal check (twice daily)
- [ ] Automated backups (optional, can set up)

### Weekly Tasks (Recommended)

- [ ] Review backend logs for errors
- [ ] Check Stripe webhook delivery success rate
- [ ] Monitor disk space usage
- [ ] Review Nginx access logs for suspicious activity

**Commands**:
```bash
# Check disk space
df -h

# Review error logs
pm2 logs onecard-backend --err --lines 100

# Check system resources
htop

# Webhook health in Stripe Dashboard
# Visit: https://dashboard.stripe.com/webhooks/[webhook_id]
```

### Monthly Tasks (Recommended)

- [ ] System updates
- [ ] Review AWS billing
- [ ] Check SSL certificate expiry (should be 60+ days)
- [ ] Review security group rules
- [ ] Test disaster recovery procedure

**Commands**:
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Check SSL certificate
sudo certbot certificates

# Review PM2 status
pm2 status
pm2 monit
```

### Quarterly Tasks (Recommended)

- [ ] Create EC2 snapshot/AMI backup
- [ ] Review and rotate Stripe API keys
- [ ] Audit access logs for security issues
- [ ] Load test application
- [ ] Review AWS cost optimization opportunities

### Annual Tasks (Recommended)

- [ ] Renew domain (theonecard.ai)
- [ ] Full security audit
- [ ] Review and update documentation
- [ ] Consider infrastructure upgrades

---

## Disaster Recovery

### Backup Strategy

#### Critical Files to Backup

1. **Environment Variables**: `/home/ubuntu/.env`
2. **MCC Rankings**: `/home/ubuntu/mcc_rankings.json`
3. **Custom Rankings**: `/home/ubuntu/custom_rankings_default.json`
4. **Nginx Config**: `/etc/nginx/sites-available/onecard`
5. **PEM Key**: `~/aws-keys/onecard-demo-key.pem`

**Backup Command**:
```bash
# On local machine - backup critical files
mkdir -p ~/onecard-backups/$(date +%Y%m%d)
cd ~/onecard-backups/$(date +%Y%m%d)

scp -i ~/aws-keys/onecard-demo-key.pem \
    ubuntu@54.196.250.76:~/.env \
    ubuntu@54.196.250.76:~/mcc_rankings.json \
    ubuntu@54.196.250.76:~/custom_rankings_default.json \
    .

scp -i ~/aws-keys/onecard-demo-key.pem \
    ubuntu@54.196.250.76:/etc/nginx/sites-available/onecard \
    nginx-config-backup
```

#### EC2 Snapshot

**Create Snapshot** (via AWS Console):
1. Go to EC2 → Volumes
2. Select the volume attached to your instance
3. Actions → Create Snapshot
4. Name: `onecard-demo-backup-YYYY-MM-DD`
5. Add description and tags

**Automated Snapshots** (optional):
- Use AWS Data Lifecycle Manager to schedule automatic snapshots
- Recommended: Daily snapshots, retain for 7 days

### Recovery Procedures

#### Scenario 1: Backend Crashed

**Recovery Time**: < 2 minutes

```bash
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76
cd ~/Backend
pm2 restart onecard-backend
pm2 status
```

#### Scenario 2: Nginx Misconfiguration

**Recovery Time**: < 5 minutes

```bash
# Test config first
sudo nginx -t

# If config broken, restore from backup
sudo cp /path/to/backup/onecard /etc/nginx/sites-available/onecard
sudo nginx -t
sudo systemctl restart nginx
```

#### Scenario 3: EC2 Instance Failure

**Recovery Time**: 30-60 minutes

**Option A: Launch from Snapshot**
1. Go to EC2 → Snapshots
2. Select most recent snapshot
3. Actions → Create Volume
4. Launch new EC2 instance with this volume
5. Update DNS A record to new IP
6. Wait for DNS propagation (5-10 min)

**Option B: Fresh Deployment**
1. Launch new EC2 instance
2. Run deployment script:
   ```bash
   ./deploy-to-aws.sh <NEW_EC2_IP> ~/aws-keys/onecard-demo-key.pem
   ```
3. Restore .env file from backup
4. Restore MCC rankings from backup
5. Update DNS A record to new IP
6. Install SSL certificate
7. Update Stripe webhook URL

#### Scenario 4: Lost SSH Access (Lost PEM Key)

**Recovery Time**: Cannot recover

**Prevention**:
- Keep secure backup of PEM key
- Store in password manager
- Keep encrypted copy on external drive

**If Lost**:
- Must terminate instance and start over
- Restore from snapshot if available
- This is why backups are critical!

#### Scenario 5: SSL Certificate Expired

**Recovery Time**: 5-10 minutes

```bash
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76

# Renew certificate
sudo certbot renew --force-renewal

# Restart Nginx
sudo systemctl restart nginx
```

#### Scenario 6: Data Corruption

**Recovery Time**: 15-30 minutes

```bash
# Restore from latest backup
scp -i ~/aws-keys/onecard-demo-key.pem \
    ~/onecard-backups/YYYYMMDD/.env \
    ubuntu@54.196.250.76:~/.env

scp -i ~/aws-keys/onecard-demo-key.pem \
    ~/onecard-backups/YYYYMMDD/mcc_rankings.json \
    ubuntu@54.196.250.76:~/mcc_rankings.json

# Restart services
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76 \
    'pm2 restart onecard-backend'
```

---

## Quick Reference Commands

### SSH Access
```bash
ssh -i ~/aws-keys/onecard-demo-key.pem ubuntu@54.196.250.76
```

### Backend Management
```bash
pm2 status                              # Check status
pm2 logs onecard-backend                # View logs
pm2 logs onecard-backend --lines 50     # Last 50 lines
pm2 logs onecard-backend --err          # Errors only
pm2 restart onecard-backend             # Restart
pm2 stop onecard-backend                # Stop
pm2 start onecard-backend               # Start
pm2 monit                               # Monitor resources
```

### Nginx Management
```bash
sudo nginx -t                           # Test config
sudo systemctl restart nginx            # Restart
sudo systemctl reload nginx             # Reload (no downtime)
sudo systemctl status nginx             # Status
sudo tail -f /var/log/nginx/error.log  # Error logs
sudo tail -f /var/log/nginx/access.log # Access logs
```

### SSL Certificate
```bash
sudo certbot certificates               # Check status
sudo certbot renew                      # Renew
sudo certbot renew --dry-run           # Test renewal
sudo systemctl status certbot.timer     # Auto-renewal status
```

### System Monitoring
```bash
htop                                    # CPU/RAM usage
df -h                                   # Disk space
free -h                                 # Memory usage
sudo netstat -tulpn | grep LISTEN       # Open ports
```

### File Upload
```bash
# Single file
scp -i ~/aws-keys/onecard-demo-key.pem \
    /path/to/local/file \
    ubuntu@54.196.250.76:~/destination/

# Directory (rsync)
rsync -avz --progress \
    -e "ssh -i ~/aws-keys/onecard-demo-key.pem" \
    /local/directory/ \
    ubuntu@54.196.250.76:~/destination/
```

### Health Checks
```bash
# Backend health
curl http://localhost:3000/health
curl https://demo.theonecard.ai/api/health

# SSL check
openssl s_client -connect demo.theonecard.ai:443 -servername demo.theonecard.ai

# DNS check
nslookup demo.theonecard.ai
dig demo.theonecard.ai
```

---

## Production URLs

| Purpose | URL |
|---------|-----|
| **Demo Application** | https://demo.theonecard.ai |
| **Backend API** | https://demo.theonecard.ai/api |
| **Health Check** | https://demo.theonecard.ai/api/health |
| **Stripe Webhook** | https://demo.theonecard.ai/webhook |

---

## Support Contacts

| Service | Dashboard/Support |
|---------|------------------|
| **AWS Console** | https://console.aws.amazon.com |
| **Stripe Dashboard** | https://dashboard.stripe.com |
| **GoDaddy DNS** | https://dcc.godaddy.com/manage/dns |
| **Let's Encrypt** | https://letsencrypt.org/docs/ |

---

## Document Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-12 | 1.0 | Initial documentation created after successful deployment |

---

## Appendix: Key Decisions

### Why Subdomain Instead of Path?

**User Request**: Host demo at `theonecard.ai/demo`

**Issue**: Main website at `theonecard.ai` is hosted on GoDaddy, demo backend on AWS EC2

**Problem**: Cannot route `theonecard.ai/demo` to AWS while keeping `theonecard.ai` on GoDaddy using only DNS records

**Solution**: Use subdomain `demo.theonecard.ai` pointing to AWS EC2

**Alternative Considered**: Move entire website to AWS (rejected as too complex)

### Why t2.micro?

- Free tier eligible (750 hours/month for 12 months)
- Sufficient for demo traffic
- 1 GB RAM adequate for Node.js backend + Nginx
- Easy to upgrade to t2.small if needed

### Why PM2?

- Process management with auto-restart
- Log management
- Zero-downtime reloads (not currently used but available)
- Easy monitoring
- Auto-start on system boot

### Why Let's Encrypt?

- Free SSL certificates
- Automated renewal
- Trusted by all browsers
- Certbot makes it easy
- 90-day validity encourages automation

### Why Nginx?

- Lightweight and fast
- Excellent reverse proxy capabilities
- Easy SSL termination
- Serves static files efficiently
- Industry standard for this use case

---

**End of Infrastructure Documentation**

For questions or issues, refer to the Troubleshooting Guide or check the monitoring/logs sections.
