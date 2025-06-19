import os
import subprocess
import shutil
import zipfile
from pathlib import Path
import tempfile
import logging
from config import Config

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class APKService:
    def __init__(self):
        # Use Config class attributes
        self.decompiled_folder = Config.OUTPUT_FOLDER
        self.apktool_jar = Config.APKTOOL_JAR
        self.jadx_executable = Config.JADX_EXECUTABLE
        
        # Ensure decompiled output folder exists
        os.makedirs(self.decompiled_folder, exist_ok=True)
        logger.info(f"APKService initialized with decompiled folder: {self.decompiled_folder}")

    def decompile_apk(self, apk_path, output_name=None):
        """
        Decompile APK using both APKTool and JADX
        """
        try:
            if not os.path.exists(apk_path):
                raise FileNotFoundError(f"APK file not found: {apk_path}")
            
            # Generate output folder name
            if not output_name:
                apk_name = Path(apk_path).stem
                output_name = f"{apk_name}_decompiled"
            
            # Create specific output folder for this APK
            apk_output_folder = os.path.join(self.decompiled_folder, output_name)
            
            # Remove existing folder if it exists
            if os.path.exists(apk_output_folder):
                shutil.rmtree(apk_output_folder)
            
            os.makedirs(apk_output_folder, exist_ok=True)
            logger.info(f"Created output folder: {apk_output_folder}")
            
            # Decompile with APKTool (for resources and manifest)
            apktool_output = os.path.join(apk_output_folder, "apktool_output")
            self._decompile_with_apktool(apk_path, apktool_output)
            
            # Decompile with JADX (for Java source code)
            jadx_output = os.path.join(apk_output_folder, "jadx_output")
            self._decompile_with_jadx(apk_path, jadx_output)
            
            # Extract basic APK info
            apk_info = self._extract_apk_info(apk_path, apktool_output)
            
            result = {
                'success': True,
                'output_folder': apk_output_folder,
                'apktool_output': apktool_output,
                'jadx_output': jadx_output,
                'apk_info': apk_info,
                'message': f'APK successfully decompiled to {apk_output_folder}'
            }
            
            logger.info(f"Decompilation completed successfully: {result}")
            return result
            
        except Exception as e:
            error_msg = f"Error decompiling APK: {str(e)}"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg,
                'output_folder': None
            }

    def _decompile_with_apktool(self, apk_path, output_folder):
        """
        Decompile APK using APKTool
        """
        try:
            logger.info(f"Starting APKTool decompilation: {apk_path} -> {output_folder}")
            
            # APKTool command
            cmd = [
                'java', '-jar', self.apktool_jar,
                'd',  # decode
                apk_path,
                '-o', output_folder,
                '-f'  # force overwrite
            ]
            
            logger.info(f"APKTool command: {' '.join(cmd)}")
            
            # Run APKTool
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes timeout
                cwd=os.path.dirname(self.apktool_jar)
            )
            
            if result.returncode == 0:
                logger.info("APKTool decompilation successful")
                logger.info(f"APKTool stdout: {result.stdout}")
            else:
                logger.error(f"APKTool failed with return code {result.returncode}")
                logger.error(f"APKTool stderr: {result.stderr}")
                raise Exception(f"APKTool failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            raise Exception("APKTool decompilation timed out")
        except Exception as e:
            raise Exception(f"APKTool error: {str(e)}")

    def _decompile_with_jadx(self, apk_path, output_folder):
        """
        Decompile APK using JADX
        """
        try:
            logger.info(f"Starting JADX decompilation: {apk_path} -> {output_folder}")
            
            # JADX command
            cmd = [
                self.jadx_executable,
                '-d', output_folder,  # output directory
                '--show-bad-code',    # show bad code
                '--no-res',          # skip resources
                apk_path
            ]
            
            logger.info(f"JADX command: {' '.join(cmd)}")
            
            # Run JADX
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minutes timeout
                cwd=os.path.dirname(self.jadx_executable)
            )
            
            if result.returncode == 0:
                logger.info("JADX decompilation successful")
                logger.info(f"JADX stdout: {result.stdout}")
            else:
                logger.warning(f"JADX completed with warnings/errors: {result.stderr}")
                # JADX often returns non-zero even on success, so we check if output exists
                if os.path.exists(output_folder) and os.listdir(output_folder):
                    logger.info("JADX output folder exists and contains files, considering successful")
                else:
                    raise Exception(f"JADX failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            raise Exception("JADX decompilation timed out")
        except Exception as e:
            raise Exception(f"JADX error: {str(e)}")

    def _extract_apk_info(self, apk_path, apktool_output):
        """
        Extract basic APK information
        """
        try:
            apk_info = {
                'file_name': os.path.basename(apk_path),
                'file_size': os.path.getsize(apk_path),
                'package_name': 'Unknown',
                'version_name': 'Unknown',
                'version_code': 'Unknown',
                'min_sdk': 'Unknown',
                'target_sdk': 'Unknown'
            }
            
            # Try to read AndroidManifest.xml from APKTool output
            manifest_path = os.path.join(apktool_output, 'AndroidManifest.xml')
            if os.path.exists(manifest_path):
                # Parse manifest for basic info
                with open(manifest_path, 'r', encoding='utf-8', errors='ignore') as f:
                    manifest_content = f.read()
                    
                # Extract package name
                if 'package=' in manifest_content:
                    start = manifest_content.find('package="') + 9
                    end = manifest_content.find('"', start)
                    if start > 8 and end > start:
                        apk_info['package_name'] = manifest_content[start:end]
                
                # Extract version info
                if 'android:versionName=' in manifest_content:
                    start = manifest_content.find('android:versionName="') + 21
                    end = manifest_content.find('"', start)
                    if start > 20 and end > start:
                        apk_info['version_name'] = manifest_content[start:end]
            
            return apk_info
            
        except Exception as e:
            logger.error(f"Error extracting APK info: {str(e)}")
            return {
                'file_name': os.path.basename(apk_path),
                'file_size': os.path.getsize(apk_path),
                'error': str(e)
            }

    def get_decompiled_files(self, output_folder):
        """
        Get list of decompiled files
        """
        try:
            if not os.path.exists(output_folder):
                return []
            
            files = []
            for root, dirs, filenames in os.walk(output_folder):
                for filename in filenames:
                    file_path = os.path.join(root, filename)
                    relative_path = os.path.relpath(file_path, output_folder)
                    files.append(relative_path)
            
            return files
            
        except Exception as e:
            logger.error(f"Error getting decompiled files: {str(e)}")
            return []

    def cleanup_old_files(self, max_age_hours=24):
        """
        Clean up old decompiled files
        """
        try:
            import time
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            
            for item in os.listdir(self.decompiled_folder):
                item_path = os.path.join(self.decompiled_folder, item)
                if os.path.isdir(item_path):
                    # Check if folder is older than max_age
                    folder_age = current_time - os.path.getctime(item_path)
                    if folder_age > max_age_seconds:
                        logger.info(f"Removing old decompiled folder: {item_path}")
                        shutil.rmtree(item_path)
                        
        except Exception as e:
            logger.error(f"Error cleaning up old files: {str(e)}")
