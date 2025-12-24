# Complete AWS EC2 Deployment Guide
## One Card Demo with Stripe Webhooks

This guide will deploy both frontend and backend to AWS EC2 with proper Stripe webhook support.

---

## Prerequisites
- AWS account with credits
- Domain: theonecard.ai (with access to DNS settings)
- Stripe account with webhook secret

---

## Step 1: Launch EC2 Instance

### 1.1 Create EC2 Instance
```bash
# Login to AWS Console → EC2 → Launch Instance

Instance Configuration:
- Name: onecard-demo
- AMI: Ubuntu Server 22.04 LTS
- Instance type: t2.micro (free tier eligible)
- Key pair: Create new or use existing
- Security Group: Create with these rules:
  * SSH (22) - Your IP
  * HTTP (80) - Anywhere
  * HTTPS (443) - Anywhere
  * Custom TCP (3000) - Anywhere (for backend)
```

### 1.2 Note your instance details:
- Public IPv4 address: `xx.xx.xx.xx`
- Public IPv4 DNS: `ec2-xx-xx-xx-xx.compute-1.amazonaws.com`

---

## Step 2: Connect and Setup Server

### 2.1 SSH into your instance
```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### 2.2 Install dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2

# Verify installations
node --version  # Should show v18.x
npm --version
nginx -v
```

---

## Step 3: Deploy Backend

### 3.1 Upload backend files to EC2
```bash
# On your local machine (new terminal):
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv

# Copy backend to EC2
scp -i your-key.pem -r Backend ubuntu@your-ec2-ip:~/
```

### 3.2 Setup backend on EC2
```bash
# Back in SSH session:
cd ~/Backend

# Install dependencies
npm install

# Create production .env file
nano .env
```

Paste your environment variables:
```env
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_webhook_secret_here
STRIPE_ISSUING_CARD_ID=your_issuing_card_id_here
STRIPE_CUSTOMER_ID=your_customer_id_here
STRIPE_FOODIE_CARD_PM_ID=your_foodie_payment_method_id
STRIPE_TRAVEL_CARD_PM_ID=your_travel_payment_method_id
STRIPE_GROCERY_CARD_PM_ID=your_grocery_payment_method_id
STRIPE_TRANSIT_CARD_PM_ID=your_transit_payment_method_id
PORT=3000
NODE_ENV=production
```
Save with `Ctrl+X`, then `Y`, then `Enter`

### 3.3 Start backend with PM2
```bash
pm2 start server.js --name onecard-backend
pm2 save
pm2 startup  # Follow the command it gives you
```

Test backend is running:
```bash
curl http://localhost:3000/health
```

---

## Step 4: Deploy Frontend

### 4.1 Upload frontend files
```bash
# On your local machine:
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv

# Copy frontend to EC2
scp -i your-key.pem -r Frontend ubuntu@your-ec2-ip:~/
```

### 4.2 Update frontend config
Before uploading, update the frontend to use your EC2 domain.

**IMPORTANT**: You need to update `Frontend/index.html` first!

---

## Step 5: Configure Nginx

### 5.1 Create Nginx configuration
```bash
# On EC2:
sudo nano /etc/nginx/sites-available/onecard
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name your-ec2-domain.compute-1.amazonaws.com;  # Update this!

    # Frontend (root and /demo path)
    location / {
        root /home/ubuntu/Frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /demo {
        alias /home/ubuntu/Frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API and webhook
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

    # Direct webhook endpoint (Stripe will use this)
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

### 5.2 Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/onecard /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

---

## Step 6: Configure Domain (Route 53)

### 6.1 Get SSL Certificate (Let's Encrypt)
```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (do this AFTER domain is pointing to EC2)
sudo certbot --nginx -d demo.theonecard.ai
```

### 6.2 Update Route 53
1. Go to Route 53 in AWS Console
2. Select your hosted zone: `theonecard.ai`
3. Create record:
   - Record name: `demo`
   - Record type: `A`
   - Value: Your EC2 public IP
   - TTL: 300

Wait 5-10 minutes for DNS propagation.

---

## Step 7: Update Stripe Webhook

### 7.1 Configure webhook endpoint in Stripe Dashboard
1. Go to: https://dashboard.stripe.com/webhooks
2. Click your existing webhook or create new
3. Update endpoint URL to: `https://demo.theonecard.ai/webhook`
4. Ensure these events are selected:
   - `issuing_authorization.request`
   - `issuing_authorization.created`
   - `payment_intent.succeeded`
5. Note: Your webhook secret should stay the same

### 7.2 Test webhook
```bash
# On EC2, watch logs:
pm2 logs onecard-backend

# Use Stripe CLI to test (on local machine):
stripe trigger issuing_authorization.request
```

---

## Step 8: Update Frontend Server URL

You need to update the frontend code to point to the correct backend URL.

**Edit Frontend/index.html lines 879-882:**

**Option A: If using subdomain (demo.theonecard.ai)**
```javascript
// Auto-detect server URL based on environment
this.serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : `${window.location.protocol}//${window.location.hostname}/api`;
```

**Option B: Direct EC2 domain**
```javascript
this.serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://demo.theonecard.ai/api';
```

After updating, re-upload:
```bash
scp -i your-key.pem Frontend/index.html ubuntu@your-ec2-ip:~/Frontend/
```

---

## Step 9: Verify Deployment

### 9.1 Check all services
```bash
# Backend status
pm2 status
pm2 logs onecard-backend

# Nginx status
sudo systemctl status nginx

# Test endpoints
curl https://demo.theonecard.ai
curl https://demo.theonecard.ai/api/health
```

### 9.2 Test in browser
1. Visit: `https://demo.theonecard.ai`
2. Open browser console (F12)
3. Complete a transaction
4. Check logs on EC2:
   ```bash
   pm2 logs onecard-backend --lines 50
   ```

---

## Troubleshooting

### Backend not responding
```bash
pm2 logs onecard-backend --err
pm2 restart onecard-backend
```

### Webhook not receiving events
```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check backend logs
pm2 logs onecard-backend

# Verify webhook endpoint is accessible
curl -X POST https://demo.theonecard.ai/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### SSL certificate issues
```bash
sudo certbot renew --dry-run
sudo certbot certificates
```

### Frontend not loading
```bash
# Check Nginx config
sudo nginx -t

# Check file permissions
ls -la /home/ubuntu/Frontend/

# Fix permissions if needed
chmod -R 755 /home/ubuntu/Frontend/
```

---

## Maintenance Commands

```bash
# View backend logs
pm2 logs onecard-backend

# Restart backend
pm2 restart onecard-backend

# Restart Nginx
sudo systemctl restart nginx

# Monitor server resources
htop

# Check disk space
df -h

# Update backend code
cd ~/Backend
git pull  # if using git
pm2 restart onecard-backend

# Renew SSL (auto-renewed, but can force)
sudo certbot renew
```

---

## Cost Estimate

With AWS Free Tier / Credits:
- t2.micro EC2: $0-8/month (free first year)
- Data transfer: ~$1-2/month
- Route 53: $0.50/month per hosted zone
- **Total: ~$0-10/month** (free with credits)

---

## Security Best Practices

1. **Restrict SSH access**
   ```bash
   # Update security group to only allow your IP for SSH
   ```

2. **Keep system updated**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Monitor logs**
   ```bash
   pm2 logs
   sudo tail -f /var/log/nginx/access.log
   ```

4. **Backup .env file** (never commit to git!)

5. **Rotate Stripe keys periodically**

---

## Next Steps

Once deployed:
1. ✅ Test complete transaction flow
2. ✅ Verify webhook events in Stripe dashboard
3. ✅ Monitor logs for errors
4. ✅ Set up CloudWatch alerts (optional)
5. ✅ Create backup snapshot of EC2 instance

---

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs onecard-backend`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify environment variables: `cat ~/Backend/.env`
4. Test webhook endpoint: Use Stripe CLI or dashboard

---

**Your webhook URL will be:** `https://demo.theonecard.ai/webhook`

This is the URL you'll configure in Stripe Dashboard!
