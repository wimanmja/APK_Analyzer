import os
import subprocess
import logging
import time # [ADDED] Import the time module

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
            # [ADDED] Get APK file size
            apk_size_bytes = os.path.getsize(apk_path)
            apk_size_mb = round(apk_size_bytes / (1024 * 1024), 2) # Convert to MB, round to 2 decimal places

            # Normalize paths for cross-platform compatibility (Windows vs Linux)
            apk_path = apk_path.replace("\\", "/")

            # Create output directory based on APK name (without extension)
            apk_name = os.path.basename(apk_path).split('.')[0]
            output_dir = os.path.join(self.output_folder, apk_name)
            output_dir = output_dir.replace("\\", "/")
            # Create the directory if it doesn't exist, exist_ok=True prevents error if it already exists
            os.makedirs(output_dir, exist_ok=True)

            # Build the Apktool command. Assumes 'java' executable is in system PATH
            # and self.apktool_path points to the apktool.jar file.
            command = [
                'java',              # Command to invoke Java Virtual Machine
                '-jar',              # Flag to execute a JAR file
                self.apktool_path,   # Full path to the apktool.jar file
                "d",                 # Apktool command: 'd' for decode (decompile)
                apk_path,            # Path to the input APK file
                "-o",                # Output directory flag
                output_dir,          # The directory where decompiled files will be stored
                "-f"                 # Force overwrite if output directory already exists
            ]
            logging.debug(f"Running command: {' '.join(command)}")

            # Emit a status message to the frontend via SocketIO
            self._emit_status(f"Decompiling APK: {apk_name}")

            # Run the command as a subprocess
            # stdout=subprocess.PIPE and stderr=subprocess.PIPE capture output/errors
            # text=True decodes output as text (UTF-8 by default)
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            # Process output from Apktool in real-time
            # This loop reads line by line and sends progress/status to the frontend
            while True:
                output = process.stdout.readline()
                if output == "" and process.poll() is not None: # Check if process finished and no more output
                    break
                if output:
                    logging.debug(f"stdout: {output.strip()}")
                    self._emit_status(output.strip()) # Send each line of Apktool's output

            # Wait for the subprocess to complete
            process.wait()
            # Read any remaining standard error output
            stderr = process.stderr.read()
            # Get the exit code of the subprocess
            returncode = process.returncode
            # Close the pipe connections
            process.stdout.close()
            process.stderr.close()

            # Check if decompilation was successful (returncode 0 indicates success)
            if returncode == 0:
                self._emit_status("Decompilation successful")
                # [MODIFIED] Return success status, output directory, and APK size
                return True, output_dir, apk_size_mb
            else:
                error_msg = f"Decompilation failed: {stderr}"
                logging.error(error_msg)
                self._emit_status(f"Error: {stderr}")
                # [MODIFIED] Return failure status, error message, and None for size
                return False, error_msg, None

        except Exception as e:
            # Catch any unexpected errors during the process
            error_msg = f"Error decompiling APK: {str(e)}"
            logging.exception(error_msg) # Log full traceback
            self._emit_status(f"Error: {str(e)}")
            # [MODIFIED] Return failure status, error message, and None for size
            return False, error_msg, None

    def _emit_status(self, message):
        """
        Emit status update via SocketIO if available
        This sends a generic status message to the frontend.

        Args:
            message: Status message to emit
        """
        if self.socketio:
            # Emitting to 'status' channel, which is listened by handleStatusUpdate in frontend
            self.socketio.emit('status', {'message': message})
