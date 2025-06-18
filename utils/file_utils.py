import os
import time
import logging

class FileUtils:
    """Utility functions for file handling"""
    
    @staticmethod
    def allowed_file(filename, allowed_extensions):
        """
        Check if a file has an allowed extension
        
        Args:
            filename: The filename to check
            allowed_extensions: Set of allowed extensions
            
        Returns:
            bool: True if file extension is allowed, False otherwise
        """
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions
    
    @staticmethod
    def save_uploaded_file(file, upload_folder, allowed_extensions):
        """
        Save an uploaded file with validation
        
        Args:
            file: The file object from request.files
            upload_folder: Folder to save the file in
            allowed_extensions: Set of allowed extensions
            
        Returns:
            tuple: (success, filepath or error_message)
        """
        # Check if file exists
        if not file or file.filename == '':
            return False, "No file selected"
        
        # Check file extension
        if not FileUtils.allowed_file(file.filename, allowed_extensions):
            return False, f"Invalid file type. Only {', '.join(allowed_extensions)} files are allowed"
        
        try:
            # Create a unique filename
            name, ext = os.path.splitext(file.filename)
            unique_filename = f"{name}_{int(time.time())}{ext}"
            filepath = os.path.join(upload_folder, unique_filename)
            
            # Save the file
            file.save(filepath)
            logging.info(f"File saved at {filepath}")
            
            return True, filepath
        except Exception as e:
            logging.error(f"Error saving file: {e}")
            return False, f"Error saving file: {str(e)}"