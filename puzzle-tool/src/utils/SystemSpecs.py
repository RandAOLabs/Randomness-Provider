"""Utility class for system specifications and resource management."""

import multiprocessing


class SystemSpecs:
    """Utility class for determining system specifications and resource allocation."""

    @staticmethod
    def get_num_parallel_processes() -> int:
        """
        Calculate the optimal number of parallel processes to use.
        
        Returns half the number of CPU cores, with a minimum of 1.
        
        Returns:
            int: Number of parallel processes to use
        """
        parallelization_denominator = 2 # if cpu has 16 cores and parallelization denominator is 2 then this codebase will use 8 cores
        return multiprocessing.cpu_count() // parallelization_denominator or 1 # default to 1 if only 1 core available
