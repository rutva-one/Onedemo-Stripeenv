# Deployment with AWS + ngrok (Temporary Solution)

## Quick Setup (5 minutes)

### 1. Start Backend Locally
```bash
cd Backend
node server.js
```

### 2. Start ngrok for Backend
```bash
ngrok http 3000
```
You'll get a URL like: `https://abc123.ngrok.io`

### 3. Update Frontend with ngrok URL
Edit `Frontend/index.html` line 879-882:
```javascript
this.serverUrl = 'https://abc123.ngrok.io'; // Your ngrok URL
```

### 4. Deploy Frontend to AWS S3
```bash
cd Frontend
aws s3 sync . s3://theonecard-demo --exclude ".*"
aws s3 website s3://theonecard-demo --index-document index.html
```

### 5. Set up CloudFront
- Create distribution pointing to S3 bucket
- Add CNAME: demo.theonecard.ai
- Update Route 53 to point to CloudFront

## Issues with ngrok:
- ❌ URL changes every time you restart (unless paid plan)
- ❌ Backend must stay running on your local machine
- ❌ Not suitable for production
- ❌ Rate limits on free tier

## Better Permanent Solution (Recommended)

Deploy both to AWS EC2 - I can help you set this up! Would take ~15 minutes and uses your AWS credits.
