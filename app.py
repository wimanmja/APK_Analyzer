import os
import logging
from flask import Flask
from flask_socketio import SocketIO

# Import your existing classes
from config import Config
from models.permission import PermissionModel
from utils.file_utils import FileUtils
from services.apk_service import APKService  # Note: Changed to APKService (uppercase)
from services.permission_service import PermissionService
from services.obfuscation_service import ObfuscationService
from web.socket_events import SocketEvents
from web.routes import Routes

class ApkAnalyzerApp:
    """Main application class for APK Analyzer"""
    
    def __init__(self):
        # Initialize and validate configuration FIRST
        self._initialize_config()
        
        # Initialize Flask app
        self.app = Flask(__name__)
        
        # Load configuration
        self.app.config.from_object(Config)
        
        # Initialize SocketIO
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        
        # Setup logging
        self._setup_logging()
        
        # Initialize services
        self._initialize_services()
        
        # Initialize routes and socket events
        self._initialize_web_components()
        
        logging.info("APK Analyzer application initialized successfully")
    
    def _initialize_config(self):
        """Initialize and validate configuration"""
        try:
            print("=== INITIALIZING APK ANALYZER CONFIGURATION ===")
            
            # Initialize configuration and validate paths
            missing_files = Config.init_app()
            
            if missing_files:
                print("⚠️  WARNING: Some required tools are missing:")
                for file in missing_files:
                    print(f"   - {file}")
                print("⚠️  Application may not work properly without these tools.")
                
                # Ask user if they want to continue
                response = input("Do you want to continue anyway? (y/N): ").lower()
                if response != 'y':
                    print("Application startup cancelled.")
                    exit(1)
            else:
                print("✅ All required tools found! Configuration validated successfully.")
            
            print("=== CONFIGURATION COMPLETE ===\n")
            
        except Exception as e:
            print(f"❌ Configuration initialization failed: {e}")
            raise
    
    def _setup_logging(self):
        """Setup application logging"""
        try:
            # Use Config class attributes
            log_level = getattr(Config, 'LOG_LEVEL', 'DEBUG')
            log_file = getattr(Config, 'LOG_FILE', 'app.log')
            
            logging.basicConfig(
                level=getattr(logging, log_level),
                format='%(asctime)s - %(levelname)s - %(message)s',
                handlers=[
                    logging.FileHandler(log_file),
                    logging.StreamHandler()
                ]
            )
            
            logging.info("Logging system initialized")
            
        except Exception as e:
            print(f"Failed to setup logging: {e}")
            # Continue without file logging
            logging.basicConfig(
                level=logging.INFO,
                format='%(asctime)s - %(levelname)s - %(message)s'
            )
    
    def _initialize_services(self):
        """Initialize all application services"""
        try:
            logging.info("Initializing application services...")
            
            # Initialize core services with Config class attributes
            self.permission_model = PermissionModel(Config.PERMISSION_FILE_PATH)
            self.file_utils = FileUtils()
            
            # Initialize APK service - Updated to use new class name and parameters
            self.apk_service = APKService()  # APKService now handles its own config
            
            # Initialize permission service
            self.permission_service = PermissionService(
                self.permission_model, 
                self.socketio
            )
            
            # Initialize obfuscation service
            self.obfuscation_service = ObfuscationService(self.socketio)
            
            logging.info("All services initialized successfully")
            
        except Exception as e:
            logging.error(f"Failed to initialize services: {e}")
            raise
    
    def _initialize_web_components(self):
        """Initialize web routes and socket events"""
        try:
            logging.info("Initializing web components...")
            
            # Initialize socket events
            self.socket_events = SocketEvents(
                self.socketio,
                self.apk_service,
                self.permission_service,
                self.obfuscation_service
            )
            
            # Initialize routes
            self.routes = Routes(
                self.app,
                Config,  # Pass Config class instead of instance
                self.apk_service,
                self.permission_service,
                self.obfuscation_service,
                self.file_utils,
                self.socketio
            )
            
            logging.info("Web components initialized successfully")
            
        except Exception as e:
            logging.error(f"Failed to initialize web components: {e}")
            raise
    
    def run(self, debug=None, host=None, port=None):
        """Run the Flask application with SocketIO"""
        # Use Config class attributes
        debug = debug if debug is not None else getattr(Config, 'DEBUG', True)
        host = host if host is not None else getattr(Config, 'HOST', '127.0.0.1')
        port = port if port is not None else getattr(Config, 'PORT', 5000)
        
        logging.info(f"Starting APK Analyzer on {host}:{port} (debug={debug})")
        
        # Create directories if they don't exist (already done in Config.init_app, but double-check)
        try:
            os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
            os.makedirs(Config.OUTPUT_FOLDER, exist_ok=True)
            logging.info("Upload and output directories verified")
        except Exception as e:
            logging.error(f"Failed to create directories: {e}")
            raise
        
        # Print startup information
        print("\n" + "="*50)
        print("🚀 APK ANALYZER STARTING")
        print("="*50)
        print(f"📍 Server: http://{host}:{port}")
        print(f"📁 Upload folder: {Config.UPLOAD_FOLDER}")
        print(f"📁 Output folder: {Config.OUTPUT_FOLDER}")
        print(f"🔧 Debug mode: {debug}")
        print("="*50)
        print("✅ Ready to analyze APK files!")
        print("="*50 + "\n")
        
        # Run the application
        try:
            self.socketio.run(
                self.app,
                debug=debug,
                host=host,
                port=port,
                allow_unsafe_werkzeug=True
            )
        except Exception as e:
            logging.error(f"Failed to start server: {e}")
            raise

def main():
    """Main entry point"""
    try:
        print("🔧 Initializing APK Security Analyzer...")
        app = ApkAnalyzerApp()
        app.run()
    except KeyboardInterrupt:
        print("\n👋 Application stopped by user")
        logging.info("Application stopped by user")
    except Exception as e:
        print(f"❌ Application failed to start: {e}")
        logging.error(f"Application failed to start: {e}")
        raise

if __name__ == '__main__':
    main()
