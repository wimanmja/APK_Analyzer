import os
import xml.etree.ElementTree as ET
import logging

class PermissionService:
    """Service for analyzing Android app permissions"""
    
    def __init__(self, permission_model, socketio=None):
        """
        Initialize the permission service
        
        Args:
            permission_model: PermissionModel instance
            socketio: SocketIO instance for real-time updates (optional)
        """
        self.permission_model = permission_model
        self.socketio = socketio
    
    def analyze_permissions(self, decompiled_dir):
        """
        Analyze permissions from a decompiled APK
        
        Args:
            decompiled_dir: Path to decompiled APK directory
            
        Returns:
            tuple: (success, permissions_list or error_message)
        """
        try:
            manifest_path = os.path.join(decompiled_dir, 'AndroidManifest.xml')
            
            if not os.path.exists(manifest_path):
                error_msg = f"AndroidManifest.xml not found at {manifest_path}"
                logging.error(error_msg)
                self._emit_status(error_msg)
                return False, error_msg
            
            # Parse manifest and extract permissions
            permissions = self._extract_permissions_from_manifest(manifest_path)
            
            # Remove duplicates
            unique_permissions = self._remove_duplicate_permissions(permissions)
            
            # Emit permissions if socketio is available
            if self.socketio:
                self.socketio.emit('permissions', {'permissions': unique_permissions})
                logging.debug(f"Permissions sent to client: {unique_permissions}")
            
            return True, unique_permissions
            
        except Exception as e:
            error_msg = f"Error analyzing permissions: {str(e)}"
            logging.exception(error_msg)
            self._emit_status(f"Error: {str(e)}")
            return False, error_msg
    
    def _extract_permissions_from_manifest(self, manifest_path):
        """
        Extract permissions from AndroidManifest.xml
        
        Args:
            manifest_path: Path to AndroidManifest.xml
            
        Returns:
            list: List of permission dictionaries
        """
        found_permissions = []
        
        try:
            tree = ET.parse(manifest_path, parser=ET.XMLParser(encoding='utf-8'))
            root = tree.getroot()
            
            for perm in root.iter():
                if 'permission' in perm.tag.lower():
                    permission_name = perm.get('{http://schemas.android.com/apk/res/android}name') \
                                    or perm.get('android:name') \
                                    or perm.get('name')
                    
                    if permission_name:
                        # Get permission details from model
                        permission_info = self.permission_model.get_permission_info(permission_name.strip())
                        found_permissions.append(permission_info)
            
            logging.info(f"Found {len(found_permissions)} permissions")
            return found_permissions
            
        except ET.ParseError as e:
            logging.error(f"XML parsing error: {e}")
            raise
        except Exception as e:
            logging.error(f"Error reading AndroidManifest.xml: {e}", exc_info=True)
            raise
    
    def _remove_duplicate_permissions(self, permissions):
        """
        Remove duplicate permissions based on name
        
        Args:
            permissions: List of permission dictionaries
            
        Returns:
            list: List of unique permission dictionaries
        """
        unique_permissions = []
        seen_permissions = set()
        
        for perm in permissions:
            if perm['name'] not in seen_permissions:
                unique_permissions.append(perm)
                seen_permissions.add(perm['name'])
        
        return unique_permissions
    
    def _emit_status(self, message):
        """
        Emit status update via SocketIO if available
        
        Args:
            message: Status message to emit
        """
        if self.socketio:
            self.socketio.emit('status', {'message': message})