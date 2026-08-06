import sqlite3
con = sqlite3.connect('app.db')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)
cur.execute('PRAGMA table_info(documents)')
cols = [r[1] for r in cur.fetchall()]
print('Document cols:', cols)
con.close()
print('Schema OK!')
