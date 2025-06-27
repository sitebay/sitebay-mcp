"""
Authentication handling for SiteBay API
"""

import os
from typing import Optional
from .exceptions import AuthenticationError, ConfigurationError


class SiteBayAuth:
    """Handles SiteBay API authentication"""
    
    def __init__(self, api_token: Optional[str] = None):
        """
        Initialize authentication with API token
        
        Args:
            api_token: SiteBay API token. If not provided, will try to get from environment
        """
        self.api_token = api_token or self._get_token_from_env()
        if not self.api_token:
            raise ConfigurationError(
                "SiteBay API token is required. Set SITEBAY_API_TOKEN environment variable "
                "or pass token directly to the server."
            )
    
    def _get_token_from_env(self) -> Optional[str]:
        """Get API token from environment variables"""
        return os.getenv("SITEBAY_API_TOKEN")
    
    def get_headers(self) -> dict[str, str]:
        """Get authentication headers for API requests"""
        if not self.api_token:
            raise AuthenticationError("No API token available")
        
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
    
    def validate_token(self) -> bool:
        """
        Validate that the API token is properly formatted
        This is a basic validation - actual verification happens on API calls
        """
        if not self.api_token:
            return False
        
        # Basic token format validation
        if len(self.api_token) < 20:  # Reasonable minimum length
            return False
            
        return True