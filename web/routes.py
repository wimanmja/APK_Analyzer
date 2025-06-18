import os
import logging
from flask import jsonify, request, render_template

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
        
        # Store analysis results for session
        self.analysis_results = {}
        
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
                
                # Save file
                success, result = self.file_utils.save_uploaded_file(
                    file, 
                    self.config.UPLOAD_FOLDER,
                    self.config.ALLOWED_EXTENSIONS
                )
                
                if not success:
                    return jsonify({"error": result}), 400
                
                filepath = result
                
                # Decompile APK
                success, decompile_result = self.apk_service.decompile_apk(filepath)
                if not success:
                    return jsonify({"error": "Decompilation failed", "details": decompile_result}), 500
                
                output_dir = decompile_result
                
                # Analyze permissions
                success, permissions = self.permission_service.analyze_permissions(output_dir)
                if not success:
                    permissions = []
                
                # Analyze obfuscation with real code analysis
                success, obfuscation = self.obfuscation_service.analyze_obfuscation(output_dir)
                if not success:
                    obfuscation = {"is_obfuscated": False, "confidence": 0, "code_snippets": []}
                
                # Get APK info
                apk_info = self._extract_apk_info(filepath, output_dir)
                
                # Calculate security score
                security_score = self._calculate_security_score(permissions, obfuscation, apk_info)
                
                # Generate summary data
                summary_data = self._generate_summary_data(apk_info, permissions, obfuscation, security_score)
                
                # Store results for detail page
                session_id = self._generate_session_id()
                self.analysis_results[session_id] = {
                    'apk_info': apk_info,
                    'permissions': permissions,
                    'obfuscation': obfuscation,
                    'security_score': security_score,
                    'output_dir': output_dir
                }
                
                # Extract manifest content
                manifest_details = self._extract_manifest_details(output_dir)
                manifest_content = manifest_details['content'] if manifest_details else "Could not read manifest"

                # Get file structure
                file_structure_list = self._get_file_structure(output_dir)

                # Log obfuscation results
                logging.info(f"Obfuscation analysis complete: {obfuscation.get('confidence', 0)}% confidence, "
                           f"{len(obfuscation.get('code_snippets', []))} code snippets found")

                # Emit socket events for real-time updates
                self.socketio.emit('permissions', {'permissions': permissions})
                self.socketio.emit('obfuscation', obfuscation)
                self.socketio.emit('analysis_complete', {
                    'fileName': file.filename,
                    'permissions': permissions,
                    'obfuscation': obfuscation,
                    'apkInfo': apk_info,
                    'manifest': manifest_content,
                    'fileStructure': file_structure_list
                })

                # Also return the complete data in the HTTP response as fallback
                return jsonify({
                    "success": True,
                    "session_id": session_id,
                    "summary": summary_data,
                    "complete_data": {
                        'fileName': file.filename,
                        'permissions': permissions,
                        'obfuscation': obfuscation,
                        'apkInfo': apk_info,
                        'manifest': manifest_content,
                        'fileStructure': file_structure_list
                    }
                }), 200
                
            except Exception as e:
                logging.exception("Error during upload or analysis")
                return jsonify({"error": "An error occurred", "details": str(e)}), 500
        
        @self.app.route('/api/summary/<session_id>')
        def get_summary(session_id):
            """Get summary data for a session"""
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
        
        apk_name = Path(apk_path).name
        apk_size = os.path.getsize(apk_path)
        
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
            import xml.etree.ElementTree as ET
            tree = ET.parse(manifest_path)
            root = tree.getroot()
            
            package_name = root.get('package', 'Unknown')
            version_name = root.get('{http://schemas.android.com/apk/res/android}versionName', 'Unknown')
            version_code = root.get('{http://schemas.android.com/apk/res/android}versionCode', 'Unknown')
            
            # Find uses-sdk element
            for elem in root.iter():
                if 'uses-sdk' in elem.tag:
                    min_sdk = elem.get('{http://schemas.android.com/apk/res/android}minSdkVersion', 'Unknown')
                    target_sdk = elem.get('{http://schemas.android.com/apk/res/android}targetSdkVersion', 'Unknown')
                    break
        except Exception as e:
            logging.warning(f"Could not extract APK info: {e}")
        
        return {
            'name': apk_name,
            'package_name': package_name,
            'version_name': version_name,
            'version_code': version_code,
            'size': format_size(apk_size),
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
            score -= (confidence / 100) * 20  # Up to 20 points for obfuscation
        
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
                if folder_name:
                    structure.append(f"{indent}📁 {folder_name}/")
                
                subindent = ' ' * 2 * (level + 1)
                for file in files[:10]:  # Limit files shown
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
