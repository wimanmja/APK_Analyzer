import os
from pathlib import Path

class Config:
    """Configuration class for APK Analyzer"""
    
    # Base directory - root folder aplikasi
    BASE_DIR = Path(__file__).parent.absolute()
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-here'
    DEBUG = True
    HOST = '127.0.0.1'
    PORT = 5000
    
    # Logging settings
    LOG_LEVEL = 'DEBUG'
    LOG_FILE = 'app.log'
    
    # File upload settings - FIXED: Use absolute paths
    UPLOAD_FOLDER = str(BASE_DIR / 'uploads')
    OUTPUT_FOLDER = str(BASE_DIR / 'decompiled_output')  # This should match your folder name
    DECOMPILED_OUTPUT_FOLDER = str(BASE_DIR / 'decompiled_output')  # Alternative name for compatibility
    ALLOWED_EXTENSIONS = {'apk'}
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
    
    # APK analysis settings - FIXED: Use absolute paths
    APKTOOL_PATH = str(BASE_DIR / 'ApkTool' / 'apktool.bat')
    APKTOOL_JAR = str(BASE_DIR / 'ApkTool' / 'apktool_2.10.0.jar')  # Added JAR path
    JADX_PATH = str(BASE_DIR / 'jadx-1.5.0' / 'bin' / 'jadx.bat')
    JADX_EXECUTABLE = str(BASE_DIR / 'jadx-1.5.0' / 'bin' / 'jadx.bat')  # Alternative name
    PERMISSION_FILE_PATH = str(BASE_DIR / 'permission_list.xlsx')
    
    # Analysis settings
    OBFUSCATION_THRESHOLD = 30  # Percentage threshold for obfuscation detection
    
    @classmethod
    def init_app(cls):
        """Initialize application directories and validate paths"""
        # Create directories if they don't exist
        os.makedirs(cls.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(cls.OUTPUT_FOLDER, exist_ok=True)
        
        # Print configuration for debugging
        print("=== APK ANALYZER CONFIGURATION ===")
        print(f"Base directory: {cls.BASE_DIR}")
        print(f"Upload folder: {cls.UPLOAD_FOLDER} - Exists: {os.path.exists(cls.UPLOAD_FOLDER)}")
        print(f"Output folder: {cls.OUTPUT_FOLDER} - Exists: {os.path.exists(cls.OUTPUT_FOLDER)}")
        print(f"APKTool JAR: {cls.APKTOOL_JAR} - Exists: {os.path.exists(cls.APKTOOL_JAR)}")
        print(f"JADX executable: {cls.JADX_EXECUTABLE} - Exists: {os.path.exists(cls.JADX_EXECUTABLE)}")
        print(f"Permission file: {cls.PERMISSION_FILE_PATH} - Exists: {os.path.exists(cls.PERMISSION_FILE_PATH)}")
        
        # Validate critical paths
        missing_files = []
        if not os.path.exists(cls.APKTOOL_JAR):
            missing_files.append(f"APKTool JAR: {cls.APKTOOL_JAR}")
        if not os.path.exists(cls.JADX_EXECUTABLE):
            missing_files.append(f"JADX executable: {cls.JADX_EXECUTABLE}")
        
        if missing_files:
            print("⚠️  WARNING: Missing required files:")
            for file in missing_files:
                print(f"   - {file}")
        else:
            print("✅ All required tools found!")
        
        return missing_files
