from flask_socketio import emit
import logging
import time # Import the time module for measuring runtime
import os   # Import os module for path operations, if needed

class SocketEvents:
    """Handle SocketIO events for real-time communication and orchestrate analysis"""

    def __init__(self, socketio, apk_service, permission_service, obfuscation_service):
        self.socketio = socketio
        self.apk_service = apk_service
        self.permission_service = permission_service
        self.obfuscation_service = obfuscation_service

        self._register_events()

    def _register_events(self):
        """Register SocketIO event handlers"""

        # Event handler for client connection
        @self.socketio.on('connect')
        def handle_connect():
            logging.info("Client connected")
            # Emit a status message back to the connected client
            emit('status', {'message': 'Connected to APK Analyzer'})

        # Event handler for client disconnection
        @self.socketio.on('disconnect')
        def handle_disconnect():
            logging.info("Client disconnected")

        # Event handler for a 'ping' event from the client
        @self.socketio.on('ping')
        def handle_ping():
            emit('pong', {'message': 'Server is alive'})

        # No direct 'start_analysis' event handled here unless you change frontend to emit it.
        # The main analysis flow is assumed to be initiated by start_full_analysis method called from routes.py
        pass # No new @self.socketio.on events are added here for this specific task.

    def start_full_analysis(self, file_path: str, original_filename: str):
        """
        Orchestrates the full analysis process for an APK.
        This method is designed to be called from routes.py (e.g., from the /upload endpoint)
        after the file has been successfully saved.

        Args:
            file_path (str): Absolute path to the uploaded APK file.
            original_filename (str): The original name of the APK file (e.g., "my_app.apk").

        Returns:
            dict: A dictionary containing the status of the analysis, and results if successful.
        """
        # --- Start timer to measure overall analysis runtime ---
        start_time = time.time()
        logging.info(f"Starting full analysis for {original_filename}...")

        # Emit an initial status message to the frontend
        self.socketio.emit('analysis_status', {'message': 'Starting analysis...'})

        # Initialize analysis results structure
        analysis_results = {
            'apk_name': original_filename,
            'apk_size_mb': None, # Will be filled by apk_service
            'permissions': [],
            'obfuscation': {},
            'manifest_content': 'Not extracted', # Placeholder, you might implement extraction later
            'file_structure': 'Not extracted'    # Placeholder, you might implement extraction later
        }

        # 1. Decompile APK
        logging.info(f"Decompiling {original_filename}...")
        # apk_service.decompile_apk now returns success, output_dir, AND apk_size_mb
        success_decompile, decompiled_data_or_error, apk_size_mb = self.apk_service.decompile_apk(file_path)

        if not success_decompile:
            error_message = decompiled_data_or_error # If failure, this is the error string
            self.socketio.emit('analysis_complete', {'status': 'error', 'message': f'Decompilation failed: {error_message}'})
            return {'status': 'error', 'message': f'Decompilation failed: {error_message}'}
        else:
            decompiled_dir = decompiled_data_or_error # If success, this is the output directory
            analysis_results['apk_size_mb'] = apk_size_mb # Store APK size in results

        # 2. Analyze Permissions
        logging.info("Analyzing permissions...")
        success_perm, permissions_data = self.permission_service.analyze_permissions(decompiled_dir)
        if success_perm:
            analysis_results['permissions'] = permissions_data
        else:
            logging.error(f"Permission analysis failed: {permissions_data}")
            self.socketio.emit('analysis_status', {'message': f'Permission analysis failed: {permissions_data}'})

        # 3. Analyze Obfuscation
        logging.info("Analyzing obfuscation...")
        success_obf, obfuscation_data = self.obfuscation_service.analyze_obfuscation(decompiled_dir)
        if success_obf:
            analysis_results['obfuscation'] = obfuscation_data
        else:
            logging.error(f"Obfuscation analysis failed: {obfuscation_data}")
            self.socketio.emit('analysis_status', {'message': f'Obfuscation analysis failed: {obfuscation_data}'})

        # --- TODO: Add Payload/Script Analysis Here when implemented ---
        # logging.info("Analyzing dangerous payloads...")
        # success_payload, payload_findings = self.payload_analysis_service.analyze_payloads(decompiled_dir)
        # if success_payload:
        #    analysis_results['dangerous_payloads'] = payload_findings
        # else:
        #    logging.error(f"Payload analysis failed: {payload_findings}")
        #    self.socketio.emit('analysis_status', {'message': f'Payload analysis failed: {payload_findings}'})
        # --- END TODO ---

        # --- End timer and calculate runtime ---
        end_time = time.time()
        runtime_seconds = round(end_time - start_time, 2) # Calculate total runtime in seconds
        analysis_results['runtime_seconds'] = runtime_seconds
        analysis_results['runtime_display'] = self._format_runtime(runtime_seconds) # Format for display

        logging.info(f"Full analysis for {original_filename} completed in {runtime_seconds} seconds.")
        # Emit final status and complete analysis results to the frontend
        self.socketio.emit('analysis_status', {'message': 'Analysis complete. Displaying results.'})
        # Send all collected analysis results to the frontend via 'analysis_complete' event
        self.socketio.emit('analysis_complete', {'status': 'success', 'results': analysis_results})

        # Return a success response (primarily for the HTTP endpoint caller in routes.py)
        return {'status': 'success', 'message': 'Analysis initiated', 'results': analysis_results}

    def _format_runtime(self, seconds: float) -> str:
        """
        Helper function to format time duration into a human-readable string.
        e.g., "15 seconds", "2 min 30 sec", "1 hours 5 min".

        Args:
            seconds (float): Time duration in seconds.

        Returns:
            str: Formatted time string.
        """
        if seconds < 60:
            return f"{seconds:.2f} seconds" # Format to 2 decimal places
        elif seconds < 3600:
            minutes = int(seconds // 60)
            remaining_seconds = round(seconds % 60, 2)
            return f"{minutes} min {remaining_seconds:.2f} sec"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours} hours {minutes} min"
