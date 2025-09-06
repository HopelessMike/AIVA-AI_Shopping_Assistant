# AIVA Fashion - Complete Deployment Guide

## 📦 Project Deployment Documentation

### Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Cloud Platform Deployments](#cloud-platform-deployments)
5. [Environment Configuration](#environment-configuration)
6. [SSL/HTTPS Setup](#sslhttps-setup)
7. [Performance Optimization](#performance-optimization)
8. [Monitoring & Analytics](#monitoring--analytics)
9. [Troubleshooting](#troubleshooting)

---

## 🔍 Pre-Deployment Checklist

### Backend Requirements
- [ ] Python 3.9+ installed
- [ ] OpenAI API key obtained
- [ ] Environment variables configured
- [ ] Security headers implemented
- [ ] CORS origins updated
- [ ] Rate limiting configured
- [ ] Database backup (if using)

### Frontend Requirements
- [ ] Node.js 18+ installed
- [ ] Production build tested
- [ ] Environment variables set
- [ ] Assets optimized
- [ ] Bundle size verified
- [ ] Browser compatibility tested
- [ ] Mobile responsiveness verified

### Voice Features Requirements
- [ ] HTTPS configured (required for production)
- [ ] Microphone permissions tested
- [ ] WebSocket SSL configured
- [ ] Italian language pack verified

---

## 🚀 Local Development Setup

### Step 1: Clone Repository
```bash
git clone https://github.com/yourusername/aiva-fashion.git
cd aiva-fashion
```

### Step 2: Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env and add:
# OPENAI_API_KEY=sk-your-key-here
# ALLOWED_ORIGINS=http://localhost:5173

# Run development server
python run.py
```

### Step 3: Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env if needed

# Run development server
npm run dev
```

### Step 4: Test Installation
1. Open http://localhost:5173 (Frontend)
2. Check http://localhost:8000/health (Backend)
3. Test voice button (requires Chrome/Edge)
4. Verify WebSocket connection

---

## 🌐 Production Deployment

## Option 1: Docker Deployment (Recommended)

### Backend Dockerfile
```dockerfile
# backend/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run with gunicorn for production
CMD ["gunicorn", "app:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### Frontend Dockerfile
```dockerfile
# frontend/Dockerfile
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ALLOWED_ORIGINS=https://yourdomain.com
    volumes:
      - ./backend:/app
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
```

### Nginx Configuration
```nginx
# nginx.conf
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # Frontend
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Deploy with Docker
```bash
# Build and start services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## ☁️ Cloud Platform Deployments

### Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy frontend
cd frontend
vercel

# Configure environment variables in Vercel dashboard
# VITE_BACKEND_URL = https://api.yourdomain.com
# VITE_WS_URL = wss://api.yourdomain.com
```

### Railway (Backend)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and initialize
railway login
railway init

# Deploy backend
cd backend
railway up

# Set environment variables
railway variables set OPENAI_API_KEY=sk-your-key
railway variables set ALLOWED_ORIGINS=https://yourdomain.com
```

### Render (Full Stack)

1. Create `render.yaml`:
```yaml
services:
  - type: web
    name: aiva-backend
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app -k uvicorn.workers.UvicornWorker
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: ALLOWED_ORIGINS
        value: https://aiva-fashion.onrender.com

  - type: web
    name: aiva-frontend
    env: static
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

2. Deploy:
```bash
# Push to GitHub
git push origin main

# Connect Render to GitHub repo
# Deploy from Render dashboard
```

### AWS EC2 Deployment

```bash
# Connect to EC2
ssh -i your-key.pem ec2-user@your-instance-ip

# Install dependencies
sudo yum update -y
sudo yum install python3 git nginx -y
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install nodejs -y

# Clone repository
git clone https://github.com/yourusername/aiva-fashion.git
cd aiva-fashion

# Setup backend with systemd
sudo nano /etc/systemd/system/aiva-backend.service
```

```ini
[Unit]
Description=AIVA Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/aiva-fashion/backend
Environment="PATH=/home/ec2-user/aiva-fashion/backend/venv/bin"
ExecStart=/home/ec2-user/aiva-fashion/backend/venv/bin/gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
# Start services
sudo systemctl start aiva-backend
sudo systemctl enable aiva-backend

# Configure Nginx
sudo nano /etc/nginx/sites-available/aiva
# Add configuration from above

# Enable site
sudo ln -s /etc/nginx/sites-available/aiva /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

---

## 🔐 Environment Configuration

### Production Environment Variables

#### Backend (.env)
```bash
# API Keys
OPENAI_API_KEY=sk-production-key-here
SECRET_KEY=your-secret-key-generate-with-openssl

# CORS & Security
ALLOWED_ORIGINS=https://yourdomain.com
ENABLE_DOCS=false
ENABLE_REDOC=false

# Rate Limiting
MAX_REQUESTS_PER_MINUTE=100
MAX_AI_REQUESTS_PER_MINUTE=20

# Database (optional)
DATABASE_URL=postgresql://user:password@localhost/aiva_db

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
ENABLE_METRICS=true
```

#### Frontend (.env.production)
```bash
VITE_BACKEND_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
VITE_ANALYTICS_ID=G-XXXXXXXXXX
```

---

## 🔒 SSL/HTTPS Setup

### Let's Encrypt with Certbot
```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Cloudflare SSL
1. Add domain to Cloudflare
2. Update nameservers
3. Enable "Full (strict)" SSL mode
4. Enable "Always Use HTTPS"
5. Configure Page Rules for caching

---

## ⚡ Performance Optimization

### Backend Optimization
```python
# Add caching
from fastapi_cache import FastAPICache
from fastapi_cache.backend.redis import RedisBackend

@app.on_event("startup")
async def startup():
    redis = aioredis.from_url("redis://localhost")
    FastAPICache.init(RedisBackend(redis), prefix="aiva-cache")

# Use caching decorator
from fastapi_cache.decorator import cache

@app.get("/api/products")
@cache(expire=300)  # Cache for 5 minutes
async def get_products():
    # Your code
```

### Frontend Optimization
```javascript
// Lazy loading
const VoiceAssistant = lazy(() => import('./components/VoiceAssistant'));

// Image optimization
import { LazyLoadImage } from 'react-lazy-load-image-component';

// Code splitting
const ProductsPage = lazy(() => 
  import(/* webpackChunkName: "products" */ './pages/Products')
);
```

### CDN Configuration
```javascript
// Use CDN for static assets
const CDN_URL = 'https://cdn.yourdomain.com';

// In vite.config.js
export default {
  base: process.env.NODE_ENV === 'production' ? CDN_URL : '/',
}
```

---

## 📊 Monitoring & Analytics

### Google Analytics 4
```html
<!-- Add to index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Sentry Error Tracking
```javascript
// Frontend
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Backend
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

sentry_sdk.init(
    dsn="YOUR_SENTRY_DSN",
    environment="production"
)
app.add_middleware(SentryAsgiMiddleware)
```

### Health Monitoring
```bash
# Setup uptime monitoring with UptimeRobot
curl -X POST https://api.uptimerobot.com/v2/newMonitor \
  -d "api_key=YOUR_KEY" \
  -d "friendly_name=AIVA Fashion" \
  -d "url=https://yourdomain.com/health"
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### Voice Not Working
```bash
# Check HTTPS
curl -I https://yourdomain.com

# Check WebSocket
wscat -c wss://yourdomain.com/ws/test

# Check browser console for errors
```

#### CORS Issues
```python
# backend/app.py
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",")
# Ensure frontend URL is in ALLOWED_ORIGINS
```

#### WebSocket Connection Failed
```nginx
# Ensure proxy headers are set
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

#### High Latency
```bash
# Check server location
ping yourdomain.com

# Use CDN for assets
# Enable caching
# Optimize images
```

---

## 📈 Performance Testing

### Load Testing with Locust
```python
# locustfile.py
from locust import HttpUser, task, between

class AIVAUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def view_products(self):
        self.client.get("/api/products")
    
    @task
    def search(self):
        self.client.get("/api/products?q=felpa")
    
    @task
    def voice_command(self):
        self.client.post("/api/voice/process", json={
            "text": "Cerco una maglia nera",
            "context": {}
        })

# Run: locust -f locustfile.py --host=https://yourdomain.com
```

### Lighthouse CI
```bash
# Install
npm install -g @lhci/cli

# Run audit
lhci autorun --collect.url=https://yourdomain.com
```

---

## 🚢 Deployment Checklist

### Pre-Launch
- [ ] All tests passing
- [ ] Security headers configured
- [ ] SSL certificate installed
- [ ] Environment variables set
- [ ] Database backed up
- [ ] Error tracking configured
- [ ] Analytics configured
- [ ] CDN configured

### Launch
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Test all endpoints
- [ ] Test voice features
- [ ] Test WebSocket connection
- [ ] Verify SSL
- [ ] Check mobile responsiveness

### Post-Launch
- [ ] Monitor error logs
- [ ] Check analytics
- [ ] Test performance
- [ ] Gather user feedback
- [ ] Set up alerts
- [ ] Document any issues

---

## 📞 Support

For deployment support:
- Email: support@yourdomain.com
- Documentation: docs.yourdomain.com
- Issues: github.com/yourusername/aiva-fashion/issues

---

**Last Updated**: 2025  
**Version**: 1.0.0  
**Status**: Production Ready