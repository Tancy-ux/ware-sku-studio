import sqlite3
import os
import shutil
from datetime import datetime

# Your database path (Desktop)
DB_PATH = r'C:\Users\welcome\Desktop\ware-sku-studio\data\ware.db'

print("=" * 50)
print("  Fix MRB -> MAR  (Marble material code)")
print("=" * 50)
print(f"\nDatabase: {DB_PATH}")

if not os.path.exists(DB_PATH):
    print("\n[!] Database not found at that path.")
    print("    Make sure the SKU Studio app is closed and the path above is correct.")
    input("\nPress Enter to exit.")
    raise SystemExit

# --- Automatic backup before touching anything ---
stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
backup_path = DB_PATH.replace('.db', f'_backup_{stamp}.db')
shutil.copy2(DB_PATH, backup_path)
print(f"\n[OK] Backup created:\n     {backup_path}")

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Show what will change
print("\n--- SKUs that will be renamed ---")
rows = c.execute(
    "SELECT id, sku_code, product_name FROM skus "
    "WHERE sku_code LIKE 'MRB%' OR material_code = 'MRB'"
).fetchall()

if not rows:
    print("  (no MRB SKUs found in the skus table)")
else:
    for r in rows:
        print(f"  ID {r[0]}: {r[1]}  -  {r[2]}")

print(f"\nTotal SKUs to rename: {len(rows)}")
print("(The material option in the dropdown will also be updated MRB -> MAR.)")

confirm = input("\nProceed with MRB -> MAR? (yes/no): ").strip().lower()

if confirm == 'yes':
    # Rename the code prefix on every MRB SKU
    c.execute("UPDATE skus SET sku_code = REPLACE(sku_code, 'MRB', 'MAR') WHERE sku_code LIKE 'MRB%'")
    # Fix the material_code field
    c.execute("UPDATE skus SET material_code = 'MAR' WHERE material_code = 'MRB'")
    # Make sure the material name is correct on those rows
    c.execute("UPDATE skus SET material_name = 'Marble' WHERE material_code = 'MAR'")
    # Update the dropdown option (table is 'options' in this build)
    c.execute("UPDATE options SET code = 'MAR' WHERE code = 'MRB' AND option_type = 'material'")
    conn.commit()
    print("\n[OK] Done. All MRB codes renamed to MAR.")
    print("     Your other SKUs were left untouched.")
    print(f"     If anything looks wrong, restore the backup:\n     {backup_path}")
else:
    print("\nCancelled. No changes were made.")

conn.close()
print("\nYou can now restart the SKU Studio app.\n")
input("Press Enter to close.")
