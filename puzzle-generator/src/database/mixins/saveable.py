from src.database.database import save_instance


class Saveable:
    def save(self) -> None:
        """
        Save the instance to the database.
        """
        save_instance(self)
