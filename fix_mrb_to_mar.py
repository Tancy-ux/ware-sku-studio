import sqlite3
import os

# Path to your database in Downloads
DB_PATH = os.path.join(os.path.expanduser('~'), 'Downloads', 'ware-sku-studio', 'ware-sku-studio', 'data', 'ware.db')

print(f"Looking for database at: {DB_PATH}")

if not os.path.exists(DB_PATH):
    print("\nDatabase not found at that path.")
    print("Searching for ware.db on your computer...")
    for root, dirs, files in os.walk(os.path.expanduser('~')):
        for f in files:
            if f == 'ware.db':
                print(f"Found at: {os.path.join(root, f)}")
    exit()

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

print("\n--- SKUs that will be updated ---")
rows = c.execute("SELECT id, sku_code, product_name FROM skus WHERE sku_code LIKE 'MRB%' OR material_code = 'MRB'").fetchall()
if not rows:
    print("No MRB SKUs found in database.")
else:
    for r in rows:
        print(f"  ID {r[0]}: {r[1]} — {r[2]}")

print(f"\nTotal: {len(rows)} SKU(s) to update")

if rows:
    confirm = input("\nProceed with renaming MRB → MAR? (yes/no): ").strip().lower()
    if confirm == 'yes':
        c.execute("UPDATE skus SET sku_code = REPLACE(sku_code, 'MRB', 'MAR') WHERE sku_code LIKE 'MRB%'")
        c.execute("UPDATE skus SET material_code = 'MAR' WHERE material_code = 'MRB'")
        c.execute("UPDATE skus SET material_name = 'Marble' WHERE material_code = 'MAR'")
        c.execute("UPDATE options SET code = 'MAR' WHERE code = 'MRB' AND option_type = 'material'")
        conn.commit()
        print("\n✓ Done. All MRB codes renamed to MAR successfully.")
    else:
        print("\nCancelled. No changes made.")
else:
    c.execute("UPDATE options SET code = 'MAR' WHERE code = 'MRB' AND option_type = 'material'")
    conn.commit()
    print("✓ Options dropdown updated to MAR.")

conn.close()
print("You can now restart the app.\n")
