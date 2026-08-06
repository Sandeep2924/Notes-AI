from database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        try:
            # Check if using SQLite or PostgreSQL
            if engine.dialect.name == "sqlite":
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN folder_id INTEGER;"))
            else:
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN folder_id INTEGER;"))
            conn.commit()
            print("Successfully added folder_id to chat_messages.")
        except Exception as e:
            print(f"Migration error (column might already exist): {e}")

if __name__ == "__main__":
    run_migration()
