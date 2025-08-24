"""Utility class for system specifications and resource management."""

import multiprocessing
from .EnvironmentManager import EnvironmentManager, EnvironmentVariables


class SystemSpecs:
    """Utility class for determining system specifications and resource allocation."""

    @staticmethod
    def get_num_parallel_processes() -> int:
        """
        Calculate the optimal number of parallel processes to use.
        
        Returns the number of CPU cores divided by the parallelization divisor,
        with a minimum of 1.
        
        The parallelization divisor can be configured via the PARALLELISM_DIVISOR
        environment variable. Default is 2.
        
        Returns:
            int: Number of parallel processes to use
        """
        parallelism_divisor = EnvironmentManager.get_int(
            EnvironmentVariables.PARALLELISM_DIVISOR
        )
        return multiprocessing.cpu_count() // parallelism_divisor or 1 # default to 1 if only 1 core available
