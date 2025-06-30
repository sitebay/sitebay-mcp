"""
SiteBay API client for handling all API communications
"""

import httpx
from typing import Any, Dict, List, Optional, Union
from .auth import SiteBayAuth
from .exceptions import APIError, AuthenticationError, SiteNotFoundError, ValidationError


class SiteBayClient:
    """Client for interacting with SiteBay API"""
    
    BASE_URL = "https://my.sitebay.org"
    API_PREFIX = "/f/api/v1"
    
    def __init__(self, auth: SiteBayAuth, timeout: float = 30.0):
        """
        Initialize SiteBay API client
        
        Args:
            auth: Authentication instance
            timeout: Request timeout in seconds
        """
        self.auth = auth
        self.timeout = timeout
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            timeout=timeout,
            headers=self.auth.get_headers()
        )
    
    async def __aenter__(self):
        """Async context manager entry"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self._client.aclose()
    
    async def close(self):
        """Close the HTTP client"""
        await self._client.aclose()
    
    def _get_url(self, endpoint: str) -> str:
        """Get full URL for an API endpoint"""
        if not endpoint.startswith("/"):
            endpoint = "/" + endpoint
        return f"{self.API_PREFIX}{endpoint}"
    
    def _format_validation_error(self, error_data: dict) -> str:
        """
        Format validation error details for better readability
        
        Args:
            error_data: Error response from API
            
        Returns:
            Formatted error message with field-specific details
        """
        if not error_data:
            return "Validation failed"
        
        # Handle FastAPI/Pydantic validation error format
        if "detail" in error_data:
            detail = error_data["detail"]
            
            # If detail is a string, return it directly
            if isinstance(detail, str):
                return f"Validation Error: {detail}"
            
            # If detail is a list of validation errors
            if isinstance(detail, list):
                error_messages = []
                for error in detail:
                    if isinstance(error, dict):
                        loc = error.get("loc", [])
                        msg = error.get("msg", "Invalid value")
                        field = " -> ".join(str(x) for x in loc) if loc else "unknown field"
                        error_messages.append(f"{field}: {msg}")
                
                if error_messages:
                    return f"Validation Error:\n" + "\n".join(f"  • {msg}" for msg in error_messages)
        
        # Handle other error formats
        if "message" in error_data:
            return f"Validation Error: {error_data['message']}"
        
        # Fallback - try to extract any useful information
        if "errors" in error_data:
            errors = error_data["errors"]
            if isinstance(errors, dict):
                error_messages = []
                for field, messages in errors.items():
                    if isinstance(messages, list):
                        for msg in messages:
                            error_messages.append(f"{field}: {msg}")
                    else:
                        error_messages.append(f"{field}: {messages}")
                
                if error_messages:
                    return f"Validation Error:\n" + "\n".join(f"  • {msg}" for msg in error_messages)
        
        return f"Validation Error: {str(error_data)}"
    
    def _extract_field_errors(self, error_data: dict) -> dict[str, str]:
        """
        Extract field-specific errors for programmatic access
        
        Args:
            error_data: Error response from API
            
        Returns:
            Dictionary mapping field names to error messages
        """
        field_errors: dict[str, str] = {}
        
        if not error_data:
            return field_errors
        
        # Handle FastAPI/Pydantic validation error format
        if "detail" in error_data and isinstance(error_data["detail"], list):
            for error in error_data["detail"]:
                if isinstance(error, dict):
                    loc = error.get("loc", [])
                    msg = error.get("msg", "Invalid value")
                    field = " -> ".join(str(x) for x in loc) if loc else "unknown"
                    field_errors[field] = msg
        
        # Handle other error formats
        elif "errors" in error_data and isinstance(error_data["errors"], dict):
            for field, messages in error_data["errors"].items():
                if isinstance(messages, list):
                    field_errors[field] = "; ".join(messages)
                else:
                    field_errors[field] = str(messages)
        
        return field_errors
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Any:
        """
        Make an HTTP request to the SiteBay API
        
        Args:
            method: HTTP method (GET, POST, PATCH, DELETE)
            endpoint: API endpoint path
            params: Query parameters
            json_data: JSON body data
            **kwargs: Additional httpx request arguments
        
        Returns:
            Response data (parsed JSON or raw response)
        
        Raises:
            APIError: For API errors
            AuthenticationError: For authentication failures
        """
        url = self._get_url(endpoint)
        
        try:
            response = await self._client.request(
                method=method,
                url=url,
                params=params,
                json=json_data,
                **kwargs
            )
            
            # Handle different response codes
            if response.status_code == 401:
                raise AuthenticationError("Invalid or expired API token")
            elif response.status_code == 404:
                raise SiteNotFoundError("Requested resource not found")
            elif response.status_code == 422:
                # Handle validation errors with detailed information
                try:
                    error_data = response.json()
                    error_message = self._format_validation_error(error_data)
                    field_errors = self._extract_field_errors(error_data)
                except Exception:
                    error_message = f"Validation Error: {response.text}"
                    error_data = None
                    field_errors = {}
                
                raise ValidationError(
                    message=error_message,
                    field_errors=field_errors
                )
            elif response.status_code >= 400:
                try:
                    error_data = response.json()
                    error_message = error_data.get("detail", f"API Error: {response.status_code}")
                except Exception:
                    error_message = f"API Error: {response.status_code} - {response.text}"
                
                raise APIError(
                    message=error_message,
                    status_code=response.status_code,
                    response_data=error_data if 'error_data' in locals() else None
                )
            
            # Try to parse JSON response
            try:
                return response.json()
            except Exception:
                # Return raw response if not JSON
                return response.text
                
        except httpx.RequestError as e:
            raise APIError(f"Network error: {str(e)}")
    
    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Make GET request"""
        return await self._request("GET", endpoint, params=params)
    
    async def post(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None, params: Optional[Dict[str, Any]] = None) -> Any:
        """Make POST request"""
        return await self._request("POST", endpoint, params=params, json_data=json_data)
    
    async def patch(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None, params: Optional[Dict[str, Any]] = None) -> Any:
        """Make PATCH request"""
        return await self._request("PATCH", endpoint, params=params, json_data=json_data)
    
    async def delete(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Make DELETE request"""
        return await self._request("DELETE", endpoint, params=params)
    
    # Site Management Methods
    async def list_sites(self, team_id: Optional[str] = None) -> Union[List[Dict[str, Any]], str]:
        """List all sites for the user"""
        params = {"team_id": team_id} if team_id else None
        response = await self.get("/site", params=params)
        
        # Handle case where API returns error as string
        if isinstance(response, str):
            return response
        
        # Handle normal dict response
        if isinstance(response, dict):
            return response.get("results", [])
        
        # Handle unexpected response format
        return f"Unexpected response format: {type(response).__name__}"
    
    async def get_site(self, fqdn: str) -> Dict[str, Any]:
        """Get details for a specific site"""
        return await self.get(f"/site/{fqdn}")
    
    async def create_site(self, site_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new site"""
        return await self.post("/site", json_data=site_data)
    
    async def update_site(self, fqdn: str, site_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing site"""
        return await self.patch(f"/site/{fqdn}", json_data=site_data)
    
    async def delete_site(self, fqdn: str) -> Dict[str, Any]:
        """Delete a site"""
        return await self.delete(f"/site/{fqdn}")
    
    # Site Operations Methods
    async def execute_shell_command(self, fqdn: str, command: str) -> Any:
        """Execute a shell command on a site"""
        return await self.post(f"/site/{fqdn}/cmd", json_data={"cmd": command})
    
    async def edit_file(self, fqdn: str, file_path: str, content: str) -> str:
        """Edit a file in the site's wp-content directory"""
        return await self.post(
            f"/site/{fqdn}/wpfile_diff_edit",
            json_data={"path": file_path, "content": content}
        )
    
    async def get_site_events(self, fqdn: str, after_datetime: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get site events"""
        params = {"after_datetime": after_datetime} if after_datetime else None
        response = await self.get(f"/site/{fqdn}/event", params=params)
        return response.get("results", [])
    
    # Staging Methods
    async def create_staging_site(self, fqdn: str, staging_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a staging site"""
        return await self.post(f"/site/{fqdn}/stage", json_data=staging_data)
    
    async def delete_staging_site(self, fqdn: str) -> Dict[str, Any]:
        """Delete a staging site"""
        return await self.delete(f"/site/{fqdn}/stage")
    
    async def commit_staging_site(self, fqdn: str) -> Dict[str, Any]:
        """Commit staging site to live"""
        return await self.post(f"/site/{fqdn}/stage/commit")
    
    # Backup/Restore Methods
    async def get_backup_commits(self, fqdn: str, number_to_fetch: int = 10) -> List[Dict[str, Any]]:
        """Get backup commits for a site"""
        params = {"number_to_fetch": number_to_fetch}
        return await self.get(f"/site/{fqdn}/pit_restore/commits", params=params)
    
    async def create_restore(self, fqdn: str, restore_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a point-in-time restore"""
        return await self.post(f"/site/{fqdn}/pit_restore", json_data=restore_data)
    
    async def list_restores(self, fqdn: str) -> List[Dict[str, Any]]:
        """List all restores for a site"""
        response = await self.get(f"/site/{fqdn}/pit_restore")
        return response.get("results", [])
    
    # External Path Methods
    async def list_external_paths(self, fqdn: str) -> List[Dict[str, Any]]:
        """List external paths for a site"""
        response = await self.get(f"/site/{fqdn}/external_path")
        return response.get("results", [])
    
    async def create_external_path(self, fqdn: str, path_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create an external path"""
        return await self.post(f"/site/{fqdn}/external_path", json_data=path_data)
    
    async def update_external_path(self, fqdn: str, path_id: str, path_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update an external path"""
        return await self.patch(f"/site/{fqdn}/external_path/{path_id}", json_data=path_data)
    
    async def delete_external_path(self, fqdn: str, path_id: str) -> Dict[str, Any]:
        """Delete an external path"""
        return await self.delete(f"/site/{fqdn}/external_path/{path_id}")
    
    # Proxy Methods
    async def wordpress_proxy(self, proxy_data: Dict[str, Any]) -> Any:
        """Proxy request to WordPress API"""
        return await self.post("/wp-proxy", json_data=proxy_data)
    
    async def shopify_proxy(self, proxy_data: Dict[str, Any]) -> Any:
        """Proxy request to Shopify API"""
        return await self.post("/shopify-proxy", json_data=proxy_data)
    
    async def posthog_proxy(self, proxy_data: Dict[str, Any]) -> Any:
        """Proxy request to PostHog API"""
        return await self.post("/posthog-proxy", json_data=proxy_data)
    
    # Team Methods
    async def list_teams(self) -> List[Dict[str, Any]]:
        """List user teams"""
        response = await self.get("/team")
        return response.get("results", [])
    
    # Template and Region Methods
    async def list_templates(self) -> List[Dict[str, Any]]:
        """List available templates"""
        response = await self.get("/template")
        return response.get("results", [])
    
    async def list_regions(self) -> List[Dict[str, Any]]:
        """List available regions"""
        return await self.get("/region")
    
    # Account Methods
    async def get_affiliate_referrals(self) -> List[Dict[str, Any]]:
        """Get affiliate referrals"""
        response = await self.get("/account/referred_user")
        return response.get("results", [])
    
    async def create_checkout_session(self, checkout_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create Stripe checkout session"""
        return await self.post("/create_checkout_session", json_data=checkout_data)