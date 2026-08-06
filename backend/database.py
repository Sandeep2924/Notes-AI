import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load .env so DATABASE_URL is available when running locally
load_dotenv()

# Neon Postgres connection string
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    SQLALCHEMY_DATABASE_URL = DATABASE_URL
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
    try:
        temp_engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args={"connect_timeout": 5}
        )
        # Test connection quickly
        with temp_engine.connect() as conn:
            pass
        engine = temp_engine
        print("Connected successfully to PostgreSQL database.")
    except Exception as e:
        print(f"[WARNING] Remote PostgreSQL connection failed ({type(e).__name__}). Falling back to local SQLite database (app.db).")
        SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
        )
else:
    # Fallback to local SQLite if no DB URL provided
    SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
