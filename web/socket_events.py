from flask_socketio import emit
import logging

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
