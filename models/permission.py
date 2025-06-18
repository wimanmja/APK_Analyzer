import pandas as pd
import logging

class PermissionModel:
    """Model for handling Android permissions data"""
    
    def __init__(self, permission_file_path):
        """Initialize the permission model with data from Excel file"""
        self.permission_file_path = permission_file_path
        self.permission_lookup = {}
        self._load_permissions()
    
    def _load_permissions(self):
        """Load permissions from Excel file and create lookup dictionary"""
        try:
            # Load data from Excel
            permission_df = pd.read_excel(self.permission_file_path)
            
            # Clean data
            permission_df['permissions'] = permission_df['permissions'].str.strip()
            permission_df['protection_level'] = permission_df['protection_level'].str.strip()
            permission_df['description'] = permission_df['description'].str.strip()
            
            # Debug: Print sample data
            logging.debug(f"Sample permissions from Excel: {permission_df.head().to_dict('records')}")
            
            # Create lookup dictionary with multiple variants for flexible matching
            for _, row in permission_df.iterrows():
                perm = row['permissions']
                perm_data = {
                    'protection_level': row['protection_level'],
                    'description': row['description']
                }
                
                # Add original permission
                self.permission_lookup[perm] = perm_data
                
                # Add lowercase version
                self.permission_lookup[perm.lower()] = perm_data
                
                # Handle android.permission. prefix variations
                if perm.startswith('android.permission.'):
                    # Add version without prefix
                    short_perm = perm[19:]  # Remove 'android.permission.'
                    self.permission_lookup[short_perm] = perm_data
                    self.permission_lookup[short_perm.lower()] = perm_data
                elif not perm.startswith('android.'):
                    # Add version with prefix
                    full_perm = f'android.permission.{perm}'
                    self.permission_lookup[full_perm] = perm_data
                    self.permission_lookup[full_perm.lower()] = perm_data
            
            logging.info(f"Loaded {len(self.permission_lookup)} permission entries")
            
        except Exception as e:
            logging.error(f"Error loading permissions: {e}")
            raise
    
    def get_permission_info(self, permission_name):
        """
        Get information about a permission
        
        Args:
            permission_name: The name of the permission to look up
            
        Returns:
            dict: Permission information or default values if not found
        """
        # Try different variants of the permission name
        variants = [
            permission_name,
            permission_name.lower()
        ]
        
        # Add prefix/no-prefix variants
        if permission_name.startswith('android.permission.'):
            short_name = permission_name[19:]
            variants.append(short_name)
            variants.append(short_name.lower())
        elif not permission_name.startswith('android.'):
            full_name = f'android.permission.{permission_name}'
            variants.append(full_name)
            variants.append(full_name.lower())
        
        # Try to find a match
        for variant in variants:
            if variant in self.permission_lookup:
                return {
                    'name': permission_name,  # Return original name
                    'protection_level': self.permission_lookup[variant]['protection_level'],
                    'description': self.permission_lookup[variant]['description']
                }
        
        # Return default values if not found
        return {
            'name': permission_name,
            'protection_level': 'unknown',
            'description': 'No description available'
        }