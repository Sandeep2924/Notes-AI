import sqlite3
con = sqlite3.connect('app.db')
cur = con.cursor()

cur.execute('PRAGMA table_info(documents)')
cols = [r[1] for r in cur.fetchall()]
print('Current document cols:', cols)

if 'last_opened_at' not in cols:
    print('Adding last_opened_at...')
    cur.execute('ALTER TABLE documents ADD COLUMN last_opened_at DATETIME')

if 'last_page_read' not in cols:
    print('Adding last_page_read...')
    cur.execute('ALTER TABLE documents ADD COLUMN last_page_read INTEGER DEFAULT 1')

con.commit()

cur.execute('PRAGMA table_info(documents)')
cols = [r[1] for r in cur.fetchall()]
print('Updated document cols:', cols)
con.close()
print('Done!')
