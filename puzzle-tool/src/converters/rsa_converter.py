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
            hex(rsa.get_p())[2:],  # remove 0x
            hex(rsa.get_q())[2:],  # remove 0x
            hex(rsa.get_N())[2:],  # remove 0x
            hex(rsa.get_phi())[2:],  # remove 0x
        )
