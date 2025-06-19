import os
import logging
from flask import Flask
from flask_socketio import SocketIO

# Import your existing classes
from config import Config
from models.permission import PermissionModel
from utils.file_utils import FileUtils
from services.apk_service import ApkService  # FIXED: Use your original class name
from services.permission_service import PermissionService
from services.obfuscation_service import ObfuscationService
from web.socket_events import SocketEvents
from web.routes import Routes

def main():
    """Main entry point - SIMPLIFIED VERSION"""
    try:
        print("🔧 Initializing APK Security Analyzer...")
        
        # Initialize Flask app
        app = Flask(__name__)
        app.config.from_object(Config)
        
        # Initialize SocketIO
        socketio = SocketIO(app, cors_allowed_origins="*")
        
        # Setup logging
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        
        # Create directories
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.OUTPUT_FOLDER, exist_ok=True)
        
        # Initialize services - FIXED: Use your original constructor parameters
        permission_model = PermissionModel(Config.PERMISSION_FILE_PATH)
        file_utils = FileUtils()
        apk_service = ApkService(Config.APKTOOL_PATH, Config.OUTPUT_FOLDER, socketio)  # FIXED
        permission_service = PermissionService(permission_model, socketio)
        obfuscation_service = ObfuscationService(socketio)
        
        # Initialize web components
        socket_events = SocketEvents(socketio, apk_service, permission_service, obfuscation_service)
        routes = Routes(app, Config, apk_service, permission_service, obfuscation_service, file_utils, socketio)
        
        # Print startup info
        print("\n" + "="*50)
        print("🚀 APK ANALYZER STARTING")
        print("="*50)
        print(f"📍 Server: http://{Config.HOST}:{Config.PORT}")
        print(f"📁 Upload folder: {Config.UPLOAD_FOLDER}")
        print(f"📁 Output folder: {Config.OUTPUT_FOLDER}")
        print("="*50)
        print("✅ Ready to analyze APK files!")
        print("="*50 + "\n")
        
        # Run the application
        socketio.run(
            app,
            debug=Config.DEBUG,
            host=Config.HOST,
            port=Config.PORT,
            allow_unsafe_werkzeug=True
        )
        
    except KeyboardInterrupt:
        print("\n👋 Application stopped by user")
    except Exception as e:
        print(f"❌ Application failed to start: {e}")
        logging.error(f"Application failed to start: {e}")
        raise

if __name__ == '__main__':
    main()
