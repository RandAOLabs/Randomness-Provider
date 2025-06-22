"""Utility class for environment variable management."""

import os
from enum import Enum
from typing import Any, cast


class EnvVarType(Enum):
    """Types of environment variables."""
    INT = "int"
    STRING = "str"
    BOOL = "bool"


class EnvironmentVariables(Enum):
    """
    Enum of known environment variables used in the application.
    
    Each enum value is a tuple of (env_var_name, default_value, type).
    """
    PARALLELISM_DIVISOR = ("PARALLELISM_DIVISOR", 2, EnvVarType.INT)
    
    def __init__(self, env_name: str, default_value: Any, var_type: EnvVarType):
        self.env_name = env_name
        self.default_value = default_value
        self.var_type = var_type


class EnvironmentManager:
    """Static utility class for environment variable management."""

    @staticmethod
    def get_value(env_var: EnvironmentVariables, override_default: Any = None) -> Any:
        """
        Get a value from an environment variable with appropriate type conversion.
        
        Args:
            env_var: The environment variable to retrieve
            override_default: Optional value to override the default defined in the enum
            
        Returns:
            The value of the environment variable or the default with appropriate type
        """
        # Use override_default if provided, otherwise use the enum's default
        default = override_default if override_default is not None else env_var.default_value
        
        # Get the value from environment
        value = os.environ.get(env_var.env_name)
        if value is None:
            return default
        
        # Convert to appropriate type
        if env_var.var_type == EnvVarType.INT:
            try:
                return int(value)
            except ValueError:
                # Log warning here if needed
                return default
        elif env_var.var_type == EnvVarType.BOOL:
            return value.lower() in ('true', 'yes', '1', 'y')
        else:  # STRING or any other type
            return value
    
    @staticmethod
    def get_int(env_var: EnvironmentVariables, default = None) -> int:
        """
        Get an integer value from an environment variable.
        
        Args:
            env_var: The environment variable to retrieve
            default: Optional value to override the default defined in the enum
            
        Returns:
            int: The value of the environment variable or the default
        """
        return cast(int, EnvironmentManager.get_value(env_var, default))

    @staticmethod
    def get_string(env_var: EnvironmentVariables, default = None) -> str:
        """
        Get a string value from an environment variable.
        
        Args:
            env_var: The environment variable to retrieve
            default: Optional value to override the default defined in the enum
            
        Returns:
            str: The value of the environment variable or the default
        """
        return cast(str, EnvironmentManager.get_value(env_var, default))

    @staticmethod
    def get_bool(env_var: EnvironmentVariables, default = None) -> bool:
        """
        Get a boolean value from an environment variable.
        
        Args:
            env_var: The environment variable to retrieve
            default: Optional value to override the default defined in the enum
            
        Returns:
            bool: The value of the environment variable or the default
        """
        return cast(bool, EnvironmentManager.get_value(env_var, default))
