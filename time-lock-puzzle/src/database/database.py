from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from src.database.constants import DATABASE_URL

# Global variable to hold the singleton engine
_engine = None


def get_engine() -> Engine:
    """
    Creates and returns a singleton SQLAlchemy engine connected to the database specified by DATABASE_URL.

    :return: SQLAlchemy Engine instance.
    :rtype: sqlalchemy.engine.Engine
    """
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL)
    return _engine


Base = declarative_base()  # Single instance of Base


def get_orm_base():
    return Base


def save_instance(instance: any) -> None:
    """
    Save an instance of an ORM model to the database.

    :param instance: The ORM model instance to save.
    """
    engine = get_engine()
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        session.add(instance)
        session.commit()
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def update_instance(instance: any) -> None:
    """
    Update an instance of an ORM model in the database.

    :param instance: The ORM model instance to update.
    """
    engine = get_engine()
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        session.merge(instance)
        session.commit()
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()
