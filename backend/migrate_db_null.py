from database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        try:
            if engine.dialect.name == "sqlite":
                # SQLite doesn't easily support ALTER TABLE ALTER COLUMN drop not null
                print("Skipping drop not null for SQLite")
            else:
                conn.execute(text("ALTER TABLE chat_messages ALTER COLUMN doc_id DROP NOT NULL;"))
            conn.commit()
            print("Successfully made doc_id nullable in chat_messages.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    run_migration()
