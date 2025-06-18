import os
import logging
from flask import Flask
from flask_socketio import SocketIO

# Import your existing classes
from config import Config
from models.permission import PermissionModel
from utils.file_utils import FileUtils
from services.apk_service import ApkService
from services.permission_service import PermissionService
from services.obfuscation_service import ObfuscationService
from web.socket_events import SocketEvents
from web.routes import Routes

class ApkAnalyzerApp:
    """Main application class for APK Analyzer"""
    
    def __init__(self):
        # Initialize Flask app
        self.app = Flask(__name__)
        
        # Load configuration
        self.config = Config()
        self.app.config.from_object(self.config)
        
        # Initialize SocketIO
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        
        # Setup logging
        self._setup_logging()
        
        # Initialize services
        self._initialize_services()
        
        # Initialize routes and socket events
        self._initialize_web_components()
        
        logging.info("APK Analyzer application initialized successfully")
    
    def _setup_logging(self):
        """Setup application logging"""
        # Use default values if not in config
        log_level = getattr(self.config, 'LOG_LEVEL', 'DEBUG')
        log_file = getattr(self.config, 'LOG_FILE', 'app.log')
        
        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
    
    def _initialize_services(self):
        """Initialize all application services"""
        try:
            # Initialize core services
            self.permission_model = PermissionModel(self.config.PERMISSION_FILE_PATH)
            self.file_utils = FileUtils()
            self.apk_service = ApkService(
                self.config.APKTOOL_PATH, 
                self.config.OUTPUT_FOLDER, 
                self.socketio
            )
            self.permission_service = PermissionService(
                self.permission_model, 
                self.socketio
            )
            self.obfuscation_service = ObfuscationService(self.socketio)
            
            logging.info("All services initialized successfully")
            
        except Exception as e:
            logging.error(f"Failed to initialize services: {e}")
            raise
    
    def _initialize_web_components(self):
        """Initialize web routes and socket events"""
        try:
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
                self.config,
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
        debug = debug if debug is not None else getattr(self.config, 'DEBUG', True)
        host = host if host is not None else getattr(self.config, 'HOST', '127.0.0.1')
        port = port if port is not None else getattr(self.config, 'PORT', 5000)
        
        logging.info(f"Starting APK Analyzer on {host}:{port} (debug={debug})")
        
        # Create upload directory if it doesn't exist
        os.makedirs(self.config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(self.config.OUTPUT_FOLDER, exist_ok=True)
        
        # Run the application
        self.socketio.run(
            self.app,
            debug=debug,
            host=host,
            port=port,
            allow_unsafe_werkzeug=True
        )

def main():
    """Main entry point"""
    try:
        app = ApkAnalyzerApp()
        app.run()
    except KeyboardInterrupt:
        logging.info("Application stopped by user")
    except Exception as e:
        logging.error(f"Application failed to start: {e}")
        raise

if __name__ == '__main__':
    main()
