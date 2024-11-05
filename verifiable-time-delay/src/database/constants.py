import os
from dotenv import load_dotenv

load_dotenv()


DATABASE_TYPE = os.getenv("DATABASE_TYPE", "sqlite")  # sqlite or postgresql
DATABASE_NAME = os.getenv("DATABASE_NAME", "mydatabase.db")
DATABASE_USER = os.getenv("DATABASE_USER", "")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD", "")
DATABASE_HOST = os.getenv("DATABASE_HOST", "localhost")
DATABASE_PORT = os.getenv("DATABASE_PORT", "5432")  # default port for PostgreSQL

# Create the database URL based on the database type
if DATABASE_TYPE == "sqlite":
    DATABASE_URL = f"sqlite:///{DATABASE_NAME}"
else:
    DATABASE_URL = (
        f"postgresql+psycopg2://{DATABASE_USER}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}"
    )
