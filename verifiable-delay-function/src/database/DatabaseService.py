from typing import List
from .mixins.saveable import Saveable


class DatabaseService:
    """Service class for database operations."""

    @staticmethod
    def save_many(instances: List[Saveable]) -> None:
        """
        Save multiple instances to the database.

        Args:
            instances: List of Saveable instances to save
        """
        for instance in instances:
            instance.save()
