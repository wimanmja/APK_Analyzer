from flask_socketio import emit
import logging
import time # Import the time module
import os # Import os module for original_filename

class SocketEvents:
    """Handle SocketIO events for real-time communication"""

    def __init__(self, socketio, apk_service, permission_service, obfuscation_service):
        self.socketio = socketio
        self.apk_service = apk_service
        self.permission_service = permission_service
        self.obfuscation_service = obfuscation_service

        self._register_events()

    def _register_events(self):
        """Register SocketIO event handlers"""

        @self.socketio.on('connect')
        def handle_connect():
            logging.info("Client connected")
            emit('status', {'message': 'Connected to APK Analyzer'})

        @self.socketio.on('disconnect')
        def handle_disconnect():
            logging.info("Client disconnected")

        @self.socketio.on('ping')
        def handle_ping():
            emit('pong', {'message': 'Server is alive'})

        # --- Tambahkan event handler untuk 'start_analysis' dari frontend ---
        # Ini akan menggantikan logika di '/upload' jika Anda ingin sepenuhnya beralih ke SocketIO untuk alur analisis.
        # Namun, karena app.js masih memanggil /upload via fetch, kita akan ubah '/upload' di routes.py.
        # Jika Anda ingin memindahkan logika analisis sepenuhnya ke sini:
        # @self.socketio.on('start_analysis')
        # def handle_start_analysis(data):
        #    file_path = data.get('file_path')
        #    original_filename = data.get('original_filename')
        #    # ... lanjutkan dengan logika analisis di bawah ini ...
        # --- End of 'start_analysis' handler ---

        # Asumsi: Anda akan memanggil fungsi analisis dari routes.py,
        # jadi kita akan membuat metode di kelas ini yang bisa dipanggil oleh Routes.
        # Atau, jika Anda ingin menyederhanakan dan semua logika analisis di sini,
        # maka data dikirim dari app.js ke event socket 'start_analysis'

        pass # Placeholder jika tidak ada event socket baru di sini

    # --- Tambahkan metode baru yang akan dipanggil dari routes.py ---
    def start_full_analysis(self, file_path: str, original_filename: str):
        """
        Orchestrates the full analysis process for an APK.
        This method is designed to be called from routes.py (e.g., from the /upload endpoint).
        """
        # --- Start timer ---
        start_time = time.time() #

        self.socketio.emit('analysis_status', {'message': 'Starting analysis...'})

        # 1. Decompile APK
        success, decompiled_dir, apk_size_mb = self.apk_service.decompile_apk(file_path) # Get apk_size_mb
        if not success:
            self.socketio.emit('analysis_complete', {'status': 'error', 'message': f'Decompilation failed: {decompiled_dir}'})
            return {'status': 'error', 'message': f'Decompilation failed: {decompiled_dir}'} # Return for routes.py

        analysis_results = {
            'apk_name': original_filename,
            'apk_size_mb': apk_size_mb, # Add APK size
            'permissions': [],
            'obfuscation': {},
            'manifest_content': 'Not extracted', # Placeholder, extract if needed
            'file_structure': 'Not extracted' # Placeholder, extract if needed
        }

        # 2. Analyze Permissions
        success_perm, permissions_data = self.permission_service.analyze_permissions(decompiled_dir)
        if success_perm:
            analysis_results['permissions'] = permissions_data
        else:
            self.socketio.emit('analysis_status', {'message': f'Permission analysis failed: {permissions_data}'})

        # 3. Analyze Obfuscation
        success_obf, obfuscation_data = self.obfuscation_service.analyze_obfuscation(decompiled_dir)
        if success_obf:
            analysis_results['obfuscation'] = obfuscation_data
        else:
            self.socketio.emit('analysis_status', {'message': f'Obfuscation analysis failed: {obfuscation_data}'})

        # --- End timer and calculate runtime ---
        end_time = time.time() #
        runtime_seconds = round(end_time - start_time, 2) #
        analysis_results['runtime_seconds'] = runtime_seconds #
        analysis_results['runtime_display'] = self._format_runtime(runtime_seconds) #

        self.socketio.emit('analysis_status', {'message': 'Analysis complete. Displaying results.'})
        self.socketio.emit('analysis_complete', {'status': 'success', 'results': analysis_results}) # Send results

        return {'status': 'success', 'message': 'Analysis initiated', 'results': analysis_results} # Return for routes.py

    def _format_runtime(self, seconds):
        """Helper to format runtime for display."""
        if seconds < 60:
            return f"{seconds} seconds" #
        elif seconds < 3600:
            minutes = int(seconds // 60) #
            remaining_seconds = round(seconds % 60, 2) #
            return f"{minutes} min {remaining_seconds} sec" #
        else:
            hours = int(seconds // 3600) #
            minutes = int((seconds % 3600) // 60) #
            return f"{hours} hours {minutes} min" #
    # --- End of new methods ---
