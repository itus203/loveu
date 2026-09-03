# DIU Nexus — Comprehensive Multi-Platform Publishing & Deployment Guide

This guide provides the complete step-by-step instructions to deploy **DIU Nexus** for **Web (500+ to 10,000+ daily concurrent users)**, publish on the **Google Play Store (Android Mobile App)**, and build the **PC Desktop App (Windows / Mac / Linux)**.

---

## 🌐 1. Web Deployment (Handling 500+ Daily Real-time Users)

### A. Recommended Cloud Providers:
1. **Render.com / Railway.app / DigitalOcean App Platform** (Easiest, zero-setup SSL)
2. **Ubuntu VPS (DigitalOcean / Linode / AWS EC2 / Hetzner)** (Maximum performance for 10,000+ users)

### B. Deployment with PM2 Cluster Mode (on VPS / Ubuntu):
```bash
# 1. Install Node.js, Git, and PM2 globally
sudo apt update && sudo apt install -y nodejs npm git
sudo npm install -g pm2

# 2. Clone / Copy DIU Nexus to your server
git clone <your-repository-url> /var/www/diu-nexus
cd /var/www/diu-nexus
npm install

# 3. Configure your .env file
nano .env
# Set PORT=5000
# Set MONGODB_URI=mongodb+srv://... (MongoDB Atlas connection string)
# Set JWT_SECRET=your_secret_production_key

# 4. Start Server with Load-Balanced CPU Clustering (Handles 500+ concurrent connections)
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### C. Nginx Reverse Proxy with Free SSL (Certbot):
```nginx
server {
 server_name yourdomain.com www.yourdomain.com;

 location / {
 proxy_pass http://localhost:5000;
 proxy_http_version 1.1;
 proxy_set_header Upgrade $http_upgrade;
 proxy_set_header Connection 'upgrade';
 proxy_set_header Host $host;
 proxy_cache_bypass $http_upgrade;
 client_max_body_size 5120M; # Support up to 5GB file/video uploads
 }
}
```
Run `sudo certbot --nginx -d yourdomain.com` for instant HTTPS.

---

## 2. Android App (Google Play Store Publication)

DIU Nexus includes a full **PWA (Progressive Web App)** with `manifest.json` and `sw.js`. You can package it into an **Android App Bundle (.aab)** for Google Play Store using **Google's official Bubblewrap CLI** or **TWA (Trusted Web Activity)**:

### Step 1: Install Bubblewrap CLI
```bash
npm install -g @bubblewrap/cli
```

### Step 2: Initialize Android Project from Your Live Web URL
```bash
bubblewrap init --manifest https://yourdomain.com/manifest.json
```
Bubblewrap will automatically configure your app name, theme color, launcher icons, and splash screen.

### Step 3: Build Signed Android App Bundle (.aab)
```bash
bubblewrap build
```
This generates `app-release-bundle.aab`.

### Step 4: Upload to Google Play Console
1. Open [Google Play Console](https://play.google.com/console).
2. Create a new application named **"DIU Nexus"**.
3. In **App releases > Production**, upload the `app-release-bundle.aab` file.
4. Set category to **Education / Social**, upload screenshots, and submit for review.

---

## 3. PC Desktop App (Windows / Mac / Linux)

DIU Nexus is fully configured with **Electron & Electron Builder**:

### Build Windows Installer (.exe):
```bash
npm run dist
```
The output `.exe` installer will be generated in the `dist/` directory ready for distribution to DIU students!

---

## 🍃 4. MongoDB Cloud (Atlas) Unlimited Storage Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free or dedicated cluster.
2. In **Database Access**, create a database user and password.
3. In **Network Access**, add `0.0.0.0/0` (Allow Access from Anywhere).
4. Click **Connect > Drivers**, copy your connection string:
 ```env
 MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/diunexus?retryWrites=true&w=majority
 MONGO_DB_NAME=diunexus
 ```
5. Paste it into your `diu-nexus/.env` file. DIU Nexus will automatically connect directly to MongoDB Cloud!
