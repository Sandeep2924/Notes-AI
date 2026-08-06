from database import engine
from sqlalchemy import text

def check_doc():
    with engine.connect() as conn:
        try:
            result = conn.execute(text("SELECT id, title, file_path FROM documents WHERE id='7f87b0c2'"))
            for row in result:
                print(row)
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    check_doc()
