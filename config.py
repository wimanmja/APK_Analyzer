import os

class Config:
    """Configuration class for APK Analyzer"""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-here'
    DEBUG = True
    HOST = '127.0.0.1'
    PORT = 5000
    
    # Logging settings
    LOG_LEVEL = 'DEBUG'
    LOG_FILE = 'app.log'
    
    # File upload settings
    UPLOAD_FOLDER = 'uploads'
    OUTPUT_FOLDER = 'decompiled_output'
    ALLOWED_EXTENSIONS = {'apk'}
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
    
    # APK analysis settings
    APKTOOL_PATH = os.path.join('ApkTool', 'apktool.bat')
    JADX_PATH = os.path.join('jadx-1.5.0', 'bin', 'jadx.bat')
    PERMISSION_FILE_PATH = 'permission_list.xlsx'
    
    # Analysis settings
    # MAX_FILES_TO_SCAN = 1000
    OBFUSCATION_THRESHOLD = 30  # Percentage threshold for obfuscation detection
