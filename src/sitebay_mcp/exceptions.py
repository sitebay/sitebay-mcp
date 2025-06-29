"""
Custom exceptions for SiteBay MCP Server
"""

from typing import Optional, Dict, Any


class SiteBayError(Exception):
    """Base exception for SiteBay MCP operations"""
    pass


class AuthenticationError(SiteBayError):
    """Raised when authentication fails"""
    pass


class APIError(SiteBayError):
    """Raised when SiteBay API returns an error"""
    
    def __init__(self, message: str, status_code: Optional[int] = None, response_data: Optional[Dict[Any, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data


class ValidationError(SiteBayError):
    """Raised when request validation fails"""
    
    def __init__(self, message: str, field_errors: Optional[Dict[Any, Any]] = None):
        super().__init__(message)
        self.field_errors = field_errors or {}


class SiteNotFoundError(SiteBayError):
    """Raised when requested site is not found"""
    pass


class TeamNotFoundError(SiteBayError):
    """Raised when requested team is not found"""
    pass


class ConfigurationError(SiteBayError):
    """Raised when configuration is invalid"""
    pass