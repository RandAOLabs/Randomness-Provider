"""Converter for RSA objects."""

from src.rsa.RSA import RSA
from src.database.entity.RSAEntity import RSAEntity


class RSAConverter:
    """Converter for storing RSA parameters in the database."""

    @staticmethod
    def to_entity(rsa: RSA) -> RSAEntity:
        """Convert an RSA instance to an RSAEntity.

        Args:
            rsa (RSA): The RSA instance to convert

        Returns:
            RSAEntity: The database entity
        """
        return RSAEntity(
            hex(rsa.get_p()),
            hex(rsa.get_q()),
            hex(rsa.get_N()),
            hex(rsa.get_phi()),
        )
