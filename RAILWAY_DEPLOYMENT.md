# Railway Deployment Guide

This guide explains how to deploy the Todo App to Railway using GitHub Actions.

## Prerequisites

- A [Railway](https://railway.app) account
- GitHub repository with the Todo App code
- Railway CLI installed locally (optional, for manual deployments)

## Setup Steps

### 1. Create a Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Empty Project"**
4. Name your project (e.g., "todo-app")

### 2. Get Railway Token

1. In Railway Dashboard, click on your profile icon (top right)
2. Go to **"Account Settings"**
3. Navigate to **"Tokens"** section
4. Click **"Create Token"**
5. Give it a name (e.g., "GitHub Actions Deploy")
6. Copy the generated token (you'll need this for GitHub Secrets)

### 3. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add the following secrets:

   **Required:**
   - **Name:** `RAILWAY_TOKEN`
   - **Value:** Your Railway token from step 2

   **Optional:**
   - **Name:** `RAILWAY_SERVICE_NAME`
   - **Value:** `todo-app` (or your preferred service name)

### 4. Deploy Your App

#### Automatic Deployment (via GitHub Actions)

The app will automatically deploy when you push to `main` or `solution` branches:

```bash
git add .
git commit -m "Deploy to Railway"
git push origin solution
```

The GitHub Action will:
- ✅ Checkout code
- ✅ Install Node.js and dependencies
- ✅ Build the application
- ✅ Deploy to Railway

#### Manual Deployment (via Railway CLI)

Alternatively, you can deploy manually:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Deploy
railway up
```

### 5. Configure Environment Variables (if needed)

If your app requires environment variables:

1. Go to Railway Dashboard → Your Project
2. Click on your service
3. Navigate to **"Variables"** tab
4. Add environment variables:
   - `NODE_ENV=production`
   - Add any other required variables

### 6. Monitor Deployment

1. Go to GitHub → **Actions** tab
2. Watch the deployment workflow run
3. Once complete, Railway will provide a URL
4. View deployment logs in Railway Dashboard → Deployments

## Workflow Configuration

The deployment workflow (`.github/workflows/deploy-railway.yml`) is configured to:

- **Trigger on:** Push to `main` or `solution` branches, or manual workflow dispatch
- **Build:** Install dependencies and build the Next.js app
- **Deploy:** Use Railway CLI to deploy the application
- **Environment:** Uses `RAILWAY_TOKEN` from GitHub Secrets

## Railway Configuration

The `railway.json` file specifies:

- **Builder:** NIXPACKS (automatic detection)
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm start`
- **Restart Policy:** ON_FAILURE with max 10 retries

## Troubleshooting

### Deployment fails with "RAILWAY_TOKEN not found"

**Solution:** Make sure you've added the `RAILWAY_TOKEN` secret to GitHub repository secrets.

### Build fails during npm install

**Solution:**
- Ensure your `package.json` is committed
- Check that all dependencies are properly listed
- Verify Node.js version compatibility

### App starts but doesn't work

**Solution:**
- Check Railway logs for errors
- Verify environment variables are set correctly
- Ensure database is accessible (if using external DB)

### Database issues

**Solution:**
- The app uses SQLite (`todos.db`) which may not persist on Railway
- Consider switching to PostgreSQL for production:
  1. Add Railway PostgreSQL service
  2. Update database connection in code
  3. Add database URL to environment variables

## Production Recommendations

For a production deployment, consider:

1. **Database:** Switch from SQLite to PostgreSQL
2. **Environment Variables:** Set all secrets in Railway (not in code)
3. **Domain:** Add a custom domain in Railway settings
4. **Monitoring:** Enable Railway metrics and logging
5. **Backup:** Set up database backups
6. **Scaling:** Configure Railway to auto-scale based on traffic

## Links

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)

## Support

If you encounter issues:
- Check Railway [Status Page](https://status.railway.app)
- Review Railway [Community Forum](https://help.railway.app)
- Check GitHub Actions logs for detailed error messages
