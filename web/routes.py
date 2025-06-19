import os
import logging
from flask import jsonify, request, render_template
# [MODIFIED] Import time for unique filename generation.
# [MODIFIED] Ensure you import the SocketEvents class correctly.
# Assuming SocketEvents is in web.socket_events
# You already pass socket_events_handler instance in __init__, so no direct import needed here if handled this way.
import time # [ADDED]
from web.socket_events import SocketEvents # [ADDED] Ensure this import is correct based on your file structure

class Routes:
    """Flask routes handler with summary and detail page support"""

    def __init__(self, app, config, apk_service, permission_service, obfuscation_service, file_utils, socketio):
        self.app = app
        self.config = config
        self.apk_service = apk_service
        self.permission_service = permission_service
        self.obfuscation_service = obfuscation_service
        self.file_utils = file_utils
        self.socketio = socketio

        # Store analysis results for session (consider using a more robust session management if app scales)
        self.analysis_results = {}

        # [MODIFIED] Initialize SocketEvents handler here so its methods can be called
        self.socket_events_handler = SocketEvents(self.socketio, self.apk_service, self.permission_service, self.obfuscation_service)

        self._register_routes()
        self._register_error_handlers()

    def _register_routes(self):
        """Register all application routes"""

        @self.app.route('/')
        def home():
            return render_template('index.html')

        @self.app.route('/upload', methods=['POST'])
        def upload_file():
            try:
                if 'file' not in request.files:
                    return jsonify({"error": "No file part"}), 400

                file = request.files['file']

                # [MODIFIED] Save file using FileUtils and validate
                success, result_filepath_or_error = self.file_utils.save_uploaded_file(
                    file,
                    self.config.UPLOAD_FOLDER,
                    self.config.ALLOWED_EXTENSIONS
                )

                if not success:
                    return jsonify({"error": result_filepath_or_error}), 400

                filepath = result_filepath_or_error # If success, this is the filepath
                original_filename = file.filename # Use original filename for analysis results

                # [MODIFIED] Initiate full analysis via SocketEvents handler
                # This call will now block until analysis is complete or an error occurs.
                # All results and status updates are emitted via SocketIO from start_full_analysis.
                analysis_response = self.socket_events_handler.start_full_analysis(filepath, original_filename)

                # [MODIFIED] Check the status from analysis_response returned by start_full_analysis
                if analysis_response['status'] == 'success':
                    # If analysis completed successfully, return the complete_data as well
                    # Frontend can use this if WebSocket missed something or for initial display
                    return jsonify({
                        "success": True,
                        "message": "File uploaded and analysis completed.",
                        "complete_data": analysis_response['results'] # Contains all analysis data including size and runtime
                    }), 200
                else:
                    # If analysis failed at any stage, return error message
                    return jsonify({
                        "success": False,
                        "error": analysis_response['message']
                    }), 500

            except Exception as e:
                logging.exception("Error during upload or analysis")
                # Specific handling for Werkzeug's RequestEntityTooLarge error
                if "RequestEntityTooLarge" in str(e):
                    return jsonify({"error": "File size exceeds server limit (check MAX_CONTENT_LENGTH in config).", "details": str(e)}), 413
                return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500

        # [ADDED] Helper method for file extension validation, assuming it's not in FileUtils or Config
        def _allowed_file(self, filename):
            return '.' in filename and filename.rsplit('.', 1)[1].lower() in self.config.ALLOWED_EXTENSIONS

        @self.app.route('/api/summary/<session_id>')
        def get_summary(session_id):
            """Get summary data for a session"""
            # Note: This part needs actual session management to work correctly.
            # Currently, analysis_results is a simple dict, not persistent.
            if session_id not in self.analysis_results:
                return jsonify({"error": "Session not found"}), 404

            data = self.analysis_results[session_id]
            summary = self._generate_summary_data(
                data['apk_info'],
                data['permissions'],
                data['obfuscation'],
                data['security_score']
            )

            return jsonify(summary)

        @self.app.route('/api/details/<session_id>')
        def get_details(session_id):
            """Get detailed analysis data for a session"""
            # Note: This part needs actual session management to work correctly.
            if session_id not in self.analysis_results:
                return jsonify({"error": "Session not found"}), 404

            data = self.analysis_results[session_id]

            # Get additional detailed information
            detailed_data = {
                'apk_info': data['apk_info'],
                'permissions': data['permissions'],
                'obfuscation': data['obfuscation'],
                'security_score': data['security_score'],
                'manifest': self._extract_manifest_details(data['output_dir']),
                'file_structure': self._get_file_structure(data['output_dir'])
            }

            return jsonify(detailed_data)

        @self.app.route('/api/obfuscation/<session_id>/snippets')
        def get_obfuscation_snippets(session_id):
            """Get paginated obfuscation code snippets"""
            # Note: This part needs actual session management to work correctly.
            if session_id not in self.analysis_results:
                return jsonify({"error": "Session not found"}), 404

            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 10, type=int)

            obfuscation_data = self.analysis_results[session_id]['obfuscation']
            code_snippets = obfuscation_data.get('code_snippets', [])

            # Calculate pagination
            total_snippets = len(code_snippets)
            start_idx = (page - 1) * per_page
            end_idx = start_idx + per_page
            page_snippets = code_snippets[start_idx:end_idx]

            return jsonify({
                'snippets': page_snippets,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total_snippets,
                    'pages': (total_snippets + per_page - 1) // per_page,
                    'has_prev': page > 1,
                    'has_next': end_idx < total_snippets
                }
            })

    def _extract_apk_info(self, apk_path, output_dir):
        """Extract basic APK information"""
        import os
        from pathlib import Path
        import xml.etree.ElementTree as ET # [ADDED] Import for XML parsing

        apk_name = Path(apk_path).name
        apk_size = os.path.getsize(apk_path) # Get size in bytes

        # Convert size to human readable format
        def format_size(size_bytes):
            if size_bytes == 0:
                return "0B"
            size_names = ["B", "KB", "MB", "GB"]
            import math
            i = int(math.floor(math.log(size_bytes, 1024)))
            p = math.pow(1024, i)
            s = round(size_bytes / p, 2)
            return f"{s} {size_names[i]}"

        # Try to extract package info from manifest
        manifest_path = os.path.join(output_dir, 'AndroidManifest.xml')
        package_name = "Unknown"
        version_name = "Unknown"
        version_code = "Unknown"
        min_sdk = "Unknown"
        target_sdk = "Unknown"

        try:
            tree = ET.parse(manifest_path)
            root = tree.getroot()

            package_name = root.get('package', 'Unknown')
            # Proper way to get attributes with namespaces
            android_namespace = '{http://schemas.android.com/apk/res/android}'
            version_name = root.get(android_namespace + 'versionName', 'Unknown')
            version_code = root.get(android_namespace + 'versionCode', 'Unknown')

            # Find uses-sdk element
            for elem in root.iter():
                if 'uses-sdk' in elem.tag:
                    min_sdk = elem.get(android_namespace + 'minSdkVersion', 'Unknown')
                    target_sdk = elem.get(android_namespace + 'targetSdkVersion', 'Unknown')
                    break
        except Exception as e:
            logging.warning(f"Could not extract APK info from manifest: {e}")

        return {
            'name': apk_name,
            'package_name': package_name,
            'version_name': version_name,
            'version_code': version_code,
            'size': format_size(apk_size), # Formatted size string
            'min_sdk_version': min_sdk,
            'target_sdk_version': target_sdk
        }

    def _calculate_security_score(self, permissions, obfuscation, apk_info):
        """Calculate a security score based on analysis results"""
        score = 100  # Start with perfect score

        # Deduct points for dangerous permissions
        dangerous_count = sum(1 for p in permissions if p.get('protection_level') == 'dangerous')
        score -= dangerous_count * 5  # 5 points per dangerous permission

        # Deduct points for obfuscation
        if obfuscation.get('is_obfuscated', False):
            confidence = obfuscation.get('confidence', 0)
            score -= (confidence / 100) * 20  # Up to 20 points for obfuscation based on confidence

        # Deduct points for old target SDK
        try:
            target_sdk = int(apk_info.get('target_sdk_version', '30'))
            if target_sdk < 28:  # Android 9 (API 28)
                score -= 15
            elif target_sdk < 30:  # Android 11 (API 30)
                score -= 10
        except (ValueError, TypeError):
            score -= 5  # Unknown SDK version

        # Ensure score is between 0 and 100
        score = max(0, min(100, int(score)))

        # Determine risk level
        if score >= 80:
            level = "Low"
        elif score >= 60:
            level = "Medium"
        else:
            level = "High"

        return {
            'score': score,
            'level': level
        }

    def _generate_summary_data(self, apk_info, permissions, obfuscation, security_score):
        """Generate summary data for the summary page"""
        # Count permissions by protection level
        permission_counts = {
            'total': len(permissions),
            'dangerous': sum(1 for p in permissions if p.get('protection_level') == 'dangerous'),
            'normal': sum(1 for p in permissions if p.get('protection_level') == 'normal'),
            'signature': sum(1 for p in permissions if p.get('protection_level') == 'signature'),
            'unknown': sum(1 for p in permissions if p.get('protection_level') == 'unknown')
        }

        # Generate key findings
        key_findings = []

        if permission_counts['dangerous'] > 5:
            key_findings.append({
                'type': 'warning',
                'message': f"High number of dangerous permissions ({permission_counts['dangerous']})"
            })

        if obfuscation.get('is_obfuscated', False):
            confidence = obfuscation.get('confidence', 0)
            snippets_count = len(obfuscation.get('code_snippets', []))
            key_findings.append({
                'type': 'info',
                'message': f"Code obfuscation detected ({confidence}% confidence, {snippets_count} code snippets found)"
            })

        try:
            target_sdk = int(apk_info.get('target_sdk_version', '30'))
            if target_sdk < 28:
                key_findings.append({
                    'type': 'warning',
                    'message': f"Outdated target SDK version ({target_sdk})"
                })
        except (ValueError, TypeError):
            pass

        if security_score['score'] >= 70:
            key_findings.append({
                'type': 'success',
                'message': "App shows good security practices"
            })

        return {
            'apk_info': apk_info,
            'security_score': security_score,
            'permissions_summary': permission_counts,
            'obfuscation': obfuscation,
            'key_findings': key_findings
        }

    def _extract_manifest_details(self, output_dir):
        """Extract detailed manifest information"""
        try:
            manifest_path = os.path.join(output_dir, 'AndroidManifest.xml')
            with open(manifest_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return {'content': content}
        except Exception as e:
            logging.warning(f"Could not read manifest: {e}")
            return {'content': 'Could not read AndroidManifest.xml'}

    def _get_file_structure(self, output_dir):
        """Get APK file structure"""
        structure = []
        try:
            for root, dirs, files in os.walk(output_dir):
                level = root.replace(output_dir, '').count(os.sep)
                indent = ' ' * 2 * level
                folder_name = os.path.basename(root)
                if folder_name: # Only add folder if it's not the base output_dir itself on the first iteration
                    structure.append(f"{indent}📁 {folder_name}/")

                subindent = ' ' * 2 * (level + 1)
                for file in files[:10]: # Limit files shown per directory for brevity
                    structure.append(f"{subindent}📄 {file}")

                if len(files) > 10:
                    structure.append(f"{subindent}... and {len(files) - 10} more files")
        except Exception as e:
            logging.warning(f"Could not get file structure: {e}")
            structure = ["Could not read file structure"]

        return structure

    def _generate_session_id(self):
        """Generate a unique session ID"""
        import uuid
        return str(uuid.uuid4())

    def _register_error_handlers(self):
        """Register error handlers"""
        @self.app.errorhandler(500)
        def internal_server_error(e):
            logging.exception("Internal Server Error:")
            return jsonify({'error': 'Internal Server Error', 'message': str(e)}), 500
