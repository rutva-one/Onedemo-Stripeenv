# One Card Demo - AWS Deployment Checklist

## Pre-Deployment Setup (15 minutes)

### 1. Launch EC2 Instance
- [ ] Log in to AWS Console
- [ ] Navigate to EC2 Dashboard
- [ ] Click "Launch Instance"
- [ ] Configure instance:
  - Name: `onecard-demo`
  - AMI: `Ubuntu Server 22.04 LTS (HVM)`
  - Instance type: `t2.micro` (free tier eligible)
  - Create or select existing key pair (download .pem file)
  - Security Group rules:
    - [ ] SSH (22) - Your IP address
    - [ ] HTTP (80) - 0.0.0.0/0 (Anywhere)
    - [ ] HTTPS (443) - 0.0.0.0/0 (Anywhere)
- [ ] Launch instance
- [ ] Wait for instance to be in "Running" state
- [ ] Note down:
  - Public IPv4 address: `_________________`
  - Public IPv4 DNS: `_________________`

### 2. Verify Your PEM Key
- [ ] Download PEM key from AWS if you created a new one
- [ ] Move it to a secure location (e.g., `~/aws-keys/`)
- [ ] Note the path: `_________________`

---

## Automated Deployment (5 minutes)

### 3. Run Deployment Script
```bash
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv
./deploy-to-aws.sh <YOUR_EC2_IP> <PATH_TO_PEM_KEY>
```

**Example:**
```bash
./deploy-to-aws.sh 54.123.45.67 ~/aws-keys/onecard-key.pem
```

### 4. Verify Deployment
- [ ] Script completes without errors
- [ ] Visit `http://<YOUR_EC2_IP>` in browser - demo loads
- [ ] Visit `http://<YOUR_EC2_IP>/demo` - demo loads
- [ ] Open browser console (F12) - no errors

---

## Domain Setup (10 minutes)

### 5. Configure DNS (Route 53 or your DNS provider)

#### If using Route 53:
- [ ] Go to Route 53 → Hosted Zones
- [ ] Select `theonecard.ai`
- [ ] Create A record:
  - Record name: `@` (or leave blank for root domain)
  - Record type: `A`
  - Value: `<YOUR_EC2_IP>`
  - TTL: `300`
  - Save
- [ ] Create CNAME record (optional www):
  - Record name: `www`
  - Record type: `CNAME`
  - Value: `theonecard.ai`
  - TTL: `300`
  - Save

#### If using another DNS provider:
- [ ] Log in to your DNS provider (GoDaddy, Namecheap, etc.)
- [ ] Create/Update A record:
  - Host: `@` or leave blank
  - Points to: `<YOUR_EC2_IP>`
  - TTL: `300` or `Automatic`

### 6. Wait for DNS Propagation
- [ ] Wait 5-10 minutes
- [ ] Check DNS: `nslookup theonecard.ai`
- [ ] Verify it points to your EC2 IP

---

## SSL Certificate Setup (5 minutes)

### 7. Install Let's Encrypt SSL Certificate
SSH into your EC2 instance:
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP>
```

Then run:
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d theonecard.ai -d www.theonecard.ai

# Follow the prompts:
# - Enter your email
# - Agree to terms (Y)
# - Share email with EFF (optional)
# - Choose option 2: Redirect HTTP to HTTPS
```

- [ ] SSL certificate installed successfully
- [ ] Visit `https://theonecard.ai` - demo loads with HTTPS
- [ ] Visit `https://theonecard.ai/demo` - demo loads with HTTPS
- [ ] Browser shows padlock icon (secure connection)

---

## Stripe Webhook Configuration (2 minutes)

### 8. Update Stripe Webhook URL
- [ ] Go to https://dashboard.stripe.com/webhooks
- [ ] Find your existing webhook or create new one
- [ ] Update endpoint URL to: `https://theonecard.ai/webhook`
- [ ] Ensure these events are enabled:
  - [ ] `issuing_authorization.request`
  - [ ] `issuing_authorization.created`
  - [ ] `payment_intent.succeeded`
- [ ] Save changes
- [ ] Test webhook using Stripe CLI or dashboard test feature

---

## Final Testing (5 minutes)

### 9. End-to-End Test
- [ ] Visit `https://theonecard.ai/demo`
- [ ] Select 4 cards for wallet
- [ ] Choose backup card
- [ ] Choose optimization preference
- [ ] Confirm wallet
- [ ] Wait for optimization to complete
- [ ] Select a transaction (e.g., Food)
- [ ] Click "Pay" button
- [ ] Verify transaction completes successfully
- [ ] Check backend logs for webhook events:
  ```bash
  ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP> 'pm2 logs onecard-backend --lines 50'
  ```
- [ ] Verify correct card was selected based on MCC
- [ ] Check Stripe Dashboard for the transaction

### 10. Browser Testing
Test on multiple browsers:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if on Mac)
- [ ] Mobile browser (optional)

---

## Monitoring & Maintenance

### 11. Setup Monitoring (Optional but Recommended)
- [ ] Enable CloudWatch monitoring for EC2
- [ ] Set up billing alerts in AWS
- [ ] Create snapshot of EC2 instance for backup

### 12. Regular Maintenance Commands

**View backend logs:**
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP> 'pm2 logs onecard-backend'
```

**Restart backend:**
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP> 'pm2 restart onecard-backend'
```

**View Nginx error logs:**
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP> 'sudo tail -f /var/log/nginx/error.log'
```

**Check system resources:**
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP> 'htop'
```

**Update code (after making changes locally):**
```bash
cd /Users/rutva/Downloads/One/Onedemo-Stripeenv
./deploy-to-aws.sh <YOUR_EC2_IP> <PATH_TO_PEM_KEY>
```

**SSL certificate auto-renewal** (Let's Encrypt auto-renews, but you can test):
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP> 'sudo certbot renew --dry-run'
```

---

## Troubleshooting

### Backend not responding
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP>
pm2 logs onecard-backend --err
pm2 restart onecard-backend
```

### Frontend not loading
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP>
sudo nginx -t
sudo systemctl restart nginx
sudo tail -f /var/log/nginx/error.log
```

### Webhook not receiving events
1. Check Stripe Dashboard webhook logs
2. Verify webhook URL is correct: `https://theonecard.ai/webhook`
3. Check backend logs: `pm2 logs onecard-backend`
4. Test endpoint: `curl -X POST https://theonecard.ai/webhook -H "Content-Type: application/json" -d '{"test": true}'`

### SSL certificate issues
```bash
ssh -i <PATH_TO_PEM_KEY> ubuntu@<YOUR_EC2_IP>
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## Cost Estimate

With AWS Free Tier / Credits:
- **t2.micro EC2:** $0-8/month (free for 12 months with new AWS accounts)
- **Data transfer:** ~$1-2/month
- **Route 53 (if used):** $0.50/month per hosted zone
- **Total:** ~$0-10/month (mostly free with credits)

---

## Security Checklist

- [ ] SSH access restricted to your IP only
- [ ] HTTPS enabled (SSL certificate installed)
- [ ] Environment variables stored securely (in .env file)
- [ ] .env file not committed to git
- [ ] Regular system updates: `sudo apt update && sudo apt upgrade -y`
- [ ] Stripe keys are test keys (not production)
- [ ] Create EC2 snapshot/backup regularly

---

## Success Criteria

✅ Demo accessible at `https://theonecard.ai/demo`
✅ SSL certificate valid (padlock icon in browser)
✅ Transactions complete successfully
✅ Stripe webhooks receiving events
✅ Backend logs show card optimization working
✅ No console errors in browser
✅ Mobile responsive

---

## Timeline Summary

| Task | Duration |
|------|----------|
| EC2 Setup | 15 min |
| Automated Deployment | 5 min |
| DNS Configuration | 10 min |
| SSL Certificate | 5 min |
| Stripe Webhook | 2 min |
| Testing | 5 min |
| **Total** | **~40-45 minutes** |

---

## Need Help?

**Deployment script failed?**
- Check the error message
- Verify EC2 IP and PEM key path are correct
- Ensure security group allows SSH from your IP
- Try running individual commands manually

**Still stuck?**
- Check AWS CloudWatch logs
- Review the detailed guide: `AWS_DEPLOYMENT_GUIDE.md`
- Check PM2 logs: `pm2 logs onecard-backend`
- Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`

---

**Deployment Date:** ________________
**Deployed By:** ________________
**EC2 Instance ID:** ________________
**Notes:** ________________________________________________
