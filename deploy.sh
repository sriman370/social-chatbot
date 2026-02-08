#!/bin/bash

# Chat App Deployment Setup Script
# This script helps you deploy your chat app step by step

set -e

echo "🚀 Chat App Deployment Setup"
echo "=============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "This script will help you deploy your chat app to:"
echo "  • MongoDB Atlas (Database)"
echo "  • Railway/Render (Backend)"
echo "  • Vercel/Netlify (Frontend)"
echo ""

# Step 1: MongoDB Atlas
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: MongoDB Atlas Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "1. Go to: https://www.mongodb.com/cloud/atlas"
print_info "2. Sign up for a FREE account"
print_info "3. Create a cluster (M0 Sandbox - FREE)"
print_info "4. Create database user"
print_info "5. Allow access from anywhere (0.0.0.0/0)"
print_info "6. Get connection string"
echo ""

read -p "Have you created your MongoDB Atlas cluster? (y/n): " mongo_done

if [ "$mongo_done" != "y" ]; then
    print_warning "Please create MongoDB Atlas cluster first!"
    print_info "Visit: https://www.mongodb.com/cloud/atlas"
    exit 1
fi

echo ""
read -p "Enter your MongoDB connection string: " mongodb_uri

if [ -z "$mongodb_uri" ]; then
    print_error "MongoDB URI is required!"
    exit 1
fi

print_success "MongoDB URI saved!"
echo ""

# Step 2: Generate JWT Secret
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Generate JWT Secret"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
jwt_secret=$(openssl rand -base64 32)
print_success "Generated secure JWT secret: $jwt_secret"
echo ""

# Step 3: Backend Deployment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Backend Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Choose your backend hosting:"
echo "  1) Railway (Recommended - Easy)"
echo "  2) Render (Also easy)"
echo "  3) Heroku (Classic)"
echo "  4) Skip (I'll do it manually)"
echo ""

read -p "Enter choice (1-4): " backend_choice

case $backend_choice in
    1)
        print_info "Railway deployment steps:"
        echo "1. Go to: https://railway.app"
        echo "2. Sign up with GitHub"
        echo "3. Click 'New Project' → 'Deploy from GitHub repo'"
        echo "4. Select your repository and 'backend' folder"
        echo "5. Add these environment variables:"
        echo ""
        echo "   MONGODB_URI=$mongodb_uri"
        echo "   JWT_SECRET=$jwt_secret"
        echo "   CLIENT_URL=(you'll add this after frontend deployment)"
        echo "   NODE_ENV=production"
        echo "   PORT=5000"
        echo ""
        read -p "After deployment, enter your Railway backend URL (e.g., https://chatapp.up.railway.app): " backend_url
        ;;
    2)
        print_info "Render deployment steps:"
        echo "1. Go to: https://render.com"
        echo "2. Sign up with GitHub"
        echo "3. Click 'New +' → 'Web Service'"
        echo "4. Connect repository, select 'backend' directory"
        echo "5. Configure:"
        echo "   - Build: npm install"
        echo "   - Start: npm start"
        echo "6. Add environment variables (same as above)"
        echo ""
        read -p "After deployment, enter your Render backend URL: " backend_url
        ;;
    3)
        print_info "Installing Heroku CLI..."
        which heroku > /dev/null 2>&1 || {
            print_warning "Heroku CLI not found. Install from: https://devcenter.heroku.com/articles/heroku-cli"
            exit 1
        }
        
        cd backend
        print_info "Creating Heroku app..."
        read -p "Enter your Heroku app name: " heroku_app_name
        heroku create $heroku_app_name
        
        print_info "Setting environment variables..."
        heroku config:set MONGODB_URI="$mongodb_uri"
        heroku config:set JWT_SECRET="$jwt_secret"
        heroku config:set NODE_ENV=production
        
        print_info "Deploying to Heroku..."
        git push heroku main
        
        backend_url="https://${heroku_app_name}.herokuapp.com"
        print_success "Backend deployed to: $backend_url"
        cd ..
        ;;
    4)
        print_warning "Skipping backend deployment"
        read -p "Enter your backend URL when ready: " backend_url
        ;;
esac

if [ -z "$backend_url" ]; then
    print_error "Backend URL is required!"
    exit 1
fi

print_success "Backend URL: $backend_url"
echo ""

# Step 4: Frontend Deployment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Frontend Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Choose your frontend hosting:"
echo "  1) Vercel (Recommended)"
echo "  2) Netlify"
echo "  3) Skip (I'll do it manually)"
echo ""

read -p "Enter choice (1-3): " frontend_choice

case $frontend_choice in
    1)
        print_info "Vercel deployment steps:"
        echo "1. Go to: https://vercel.com"
        echo "2. Sign up with GitHub"
        echo "3. Click 'Add New Project'"
        echo "4. Select your repository"
        echo "5. Framework: Create React App"
        echo "6. Root Directory: frontend-enhanced"
        echo "7. Add environment variable:"
        echo ""
        echo "   REACT_APP_API_URL=$backend_url"
        echo ""
        read -p "After deployment, enter your Vercel frontend URL: " frontend_url
        ;;
    2)
        print_info "Netlify deployment steps:"
        echo "1. Go to: https://netlify.com"
        echo "2. Sign up with GitHub"
        echo "3. Click 'Add new site' → 'Import existing project'"
        echo "4. Select your repository"
        echo "5. Configure:"
        echo "   - Base directory: frontend-enhanced"
        echo "   - Build command: npm run build"
        echo "   - Publish directory: build"
        echo "6. Add environment variable:"
        echo ""
        echo "   REACT_APP_API_URL=$backend_url"
        echo ""
        read -p "After deployment, enter your Netlify frontend URL: " frontend_url
        ;;
    3)
        print_warning "Skipping frontend deployment"
        read -p "Enter your frontend URL when ready: " frontend_url
        ;;
esac

if [ -z "$frontend_url" ]; then
    print_error "Frontend URL is required!"
    exit 1
fi

print_success "Frontend URL: $frontend_url"
echo ""

# Step 5: Update Backend CORS
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Update Backend CORS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_warning "IMPORTANT: Update your backend environment variables!"
echo ""
echo "Add this environment variable to your backend:"
echo "   CLIENT_URL=$frontend_url"
echo ""
print_info "Then redeploy your backend if necessary"
echo ""

# Step 6: Create summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Save to file
cat > DEPLOYMENT_SUMMARY.txt << EOF
🚀 Chat App Deployment Summary
================================

📅 Deployed: $(date)

🗄️  Database (MongoDB Atlas)
   Connection String: $mongodb_uri

🔐 Security
   JWT Secret: $jwt_secret

🖥️  Backend
   URL: $backend_url
   Environment Variables:
      MONGODB_URI=$mongodb_uri
      JWT_SECRET=$jwt_secret
      CLIENT_URL=$frontend_url
      NODE_ENV=production
      PORT=5000

🌐 Frontend
   URL: $frontend_url
   Environment Variables:
      REACT_APP_API_URL=$backend_url

✅ Next Steps:
   1. Test your app at: $frontend_url
   2. Register two accounts
   3. Test messaging and calls
   4. Share with friends!

🔗 Share this link:
   $frontend_url

📚 Troubleshooting:
   - Check backend logs
   - Verify all environment variables
   - Ensure CORS is configured
   - Check MongoDB IP whitelist

EOF

cat DEPLOYMENT_SUMMARY.txt
echo ""
print_success "Deployment details saved to: DEPLOYMENT_SUMMARY.txt"
echo ""

print_success "🎉 Deployment setup complete!"
echo ""
echo "Test your app now:"
print_info "Open: $frontend_url"
echo ""
print_warning "Remember to update CLIENT_URL in backend environment variables!"
echo ""
print_success "Share your app: $frontend_url"
