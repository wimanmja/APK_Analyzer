import os
import subprocess
import logging
import time # Import the time module

class ApkService:
    """Service for APK decompilation and analysis"""

    def __init__(self, apktool_path, output_folder, socketio=None):
        """
        Initialize the APK service

        Args:
            apktool_path: Path to apktool executable
            output_folder: Folder to store decompiled APKs
            socketio: SocketIO instance for real-time updates (optional)
        """
        self.apktool_path = apktool_path
        self.output_folder = output_folder
        self.socketio = socketio

    def decompile_apk(self, apk_path):
        """
        Decompile an APK file

        Args:
            apk_path: Path to the APK file

        Returns:
            tuple: (success, output_dir or error_message, apk_size_mb)
        """
        try:
            # Get APK file size
            apk_size_bytes = os.path.getsize(apk_path) #
            apk_size_mb = round(apk_size_bytes / (1024 * 1024), 2) #

            # Normalize paths
            apk_path = apk_path.replace("\\", "/")

            # Create output directory based on APK name
            apk_name = os.path.basename(apk_path).split('.')[0]
            output_dir = os.path.join(self.output_folder, apk_name)
            output_dir = output_dir.replace("\\", "/")
            os.makedirs(output_dir, exist_ok=True)

            # Build command (Assuming 'java' is in PATH and apktool_path is to the .jar)
            command = [
                'java',
                '-jar',
                self.apktool_path,
                "d",
                apk_path,
                "-o",
                output_dir,
                "-f"
            ]
            logging.debug(f"Running command: {' '.join(command)}")

            # Emit status if socketio is available
            self._emit_status(f"Decompiling APK: {apk_name}")

            # Run the command
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            # Process output in real-time
            while True:
                output = process.stdout.readline()
                if output == "" and process.poll() is not None:
                    break
                if output:
                    logging.debug(f"stdout: {output.strip()}")
                    self._emit_status(output.strip())

            # Get final status
            process.wait()
            stderr = process.stderr.read()
            returncode = process.returncode
            process.stdout.close()
            process.stderr.close()

            # Check if decompilation was successful
            if returncode == 0:
                self._emit_status("Decompilation successful")
                return True, output_dir, apk_size_mb # Return apk_size_mb
            else:
                error_msg = f"Decompilation failed: {stderr}"
                logging.error(error_msg)
                self._emit_status(f"Error: {stderr}")
                return False, error_msg, None # Return None for size on error

        except Exception as e:
            error_msg = f"Error decompiling APK: {str(e)}"
            logging.exception(error_msg)
            self._emit_status(f"Error: {str(e)}")
            return False, error_msg, None # Return None for size on error

    def _emit_status(self, message):
        """
        Emit status update via SocketIO if available

        Args:
            message: Status message to emit
        """
        if self.socketio:
            self.socketio.emit('status', {'message': message})
