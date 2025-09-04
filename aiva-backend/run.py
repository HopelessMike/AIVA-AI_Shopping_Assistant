#!/usr/bin/env python
"""
AIVA Backend Server Startup Script
Run with: python run.py
"""

import os
import sys
import uvicorn
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger("AIVA.Server")

def check_requirements():
    """Check if all required packages are installed"""
    required_packages = [
        "fastapi",
        "uvicorn",
        "pydantic",
        "httpx",
        "python-dotenv"
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing.append(package)
    
    if missing:
        logger.error(f"Missing required packages: {', '.join(missing)}")
        logger.info("Please run: pip install -r requirements.txt")
        sys.exit(1)

def check_environment():
    """Check and display environment configuration"""
    logger.info("=" * 60)
    logger.info("AIVA E-commerce Voice Assistant Backend")
    logger.info("=" * 60)
    
    # Check OpenAI configuration
    if os.getenv("OPENAI_API_KEY"):
        logger.info("✅ OpenAI API Key configured")
        logger.info(f"   Model: {os.getenv('OPENAI_MODEL', 'gpt-4-turbo-preview')}")
    else:
        logger.warning("⚠️  OpenAI API Key not configured")
        logger.warning("   Using fallback mode with limited functionality")
        logger.info("   Set OPENAI_API_KEY in .env file for full AI capabilities")
    
    # Display CORS configuration
    cors_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    logger.info(f"📡 CORS Origins: {cors_origins}")
    
    # Display rate limiting
    logger.info(f"🛡️  Rate Limiting: {os.getenv('MAX_REQUESTS_PER_MINUTE', 60)} req/min")
    logger.info(f"🤖 AI Rate Limit: {os.getenv('MAX_AI_REQUESTS_PER_MINUTE', 10)} req/min")
    
    logger.info("=" * 60)

def main():
    """Main entry point"""
    # Check requirements
    check_requirements()
    
    # Check environment
    check_environment()
    
    # Get configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    log_level = os.getenv("LOG_LEVEL", "info")
    
    # Start server
    logger.info(f"🚀 Starting server on http://{host}:{port}")
    logger.info(f"📚 API Documentation: http://{host}:{port}/api/docs")
    logger.info(f"📊 Alternative Docs: http://{host}:{port}/api/redoc")
    logger.info("Press CTRL+C to stop")
    logger.info("=" * 60)
    
    try:
        uvicorn.run(
            "app:app",
            host=host,
            port=port,
            reload=reload,
            log_level=log_level,
            access_log=True
        )
    except KeyboardInterrupt:
        logger.info("\n👋 Shutting down server...")
        sys.exit(0)
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()