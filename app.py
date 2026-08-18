from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import os
import requests
from datetime import datetime

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'ware.db')
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'data', 'config.json')

# ─── DATABASE SETUP ───────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS skus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku_code TEXT UNIQUE NOT NULL,
        product_name TEXT,
        material_code TEXT,
        material_name TEXT,
        color_code TEXT,
        color_name TEXT,
        typology_code TEXT,
        typology_name TEXT,
        product_number TEXT,
        notes TEXT,
        zoho_item_id TEXT,
        zoho_synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS typology_counters (
        typology_code TEXT PRIMARY KEY,
        last_number INTEGER NOT NULL DEFAULT 0
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS category_counters (
        category_code TEXT PRIMARY KEY,
        last_number INTEGER NOT NULL DEFAULT 0
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS assembly_skus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku_code TEXT UNIQUE NOT NULL,
        product_name TEXT,
        category_code TEXT,
        category_name TEXT,
        variant_code TEXT,
        variant_name TEXT,
        design_code TEXT,
        design_name TEXT,
        seq_number TEXT,
        bom TEXT,
        notes TEXT,
        zoho_item_id TEXT,
        zoho_synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_type TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(option_type, code)
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT,
        unit TEXT DEFAULT 'unit',
        reel_size REAL DEFAULT 1.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    # Seed default options
    defaults = {
        'material': [
            ('CER','Ceramic'),('MAR','Marble'),('WOD','Wood'),('MTL','Metal'),
            ('GLS','Glass'),('STN','Stone'),('PRC','Porcelain'),('FAB','Fabric'),
            ('3DP','3D Print'),('LED','LED Strip'),('DRI','Driver'),('PRO','Profile'),
        ],
        'color': [
            ('001','Pure White'),('002','Warm Beige'),('003','Sand'),('004','Ivory'),
            ('005','Ash Grey'),('006','Charcoal'),('007','Midnight Black'),
            ('008','Terracotta'),('009','Sage Green'),('010','Navy Blue'),
            ('011','Black'),('046','Warm Brown'),
        ],
        'typology': [
            ('AB','Floor Tile'),('CD','Wall Tile'),('EF','Countertop'),('GH','Panel'),
            ('IJ','Slab'),('KL','Mosaic'),('MN','Border'),('AE','Bowl'),
            ('EC','Eclipse'),('HA','Hardware'),('LI','Light'),('HK','Hook'),
        ],
        'category': [
            ('LMP','Lamp'),('SET','Set'),('KIT','Kit'),('FUR','Furniture'),
            ('ACC','Accessory'),('DSH','Dishware'),('WAL','Wall Fixture'),('LTG','Lighting'),
        ],
        'variant': [
            ('001','Warm Brown'),('002','Cool Grey'),('003','Natural Oak'),
            ('004','Ivory White'),('005','Midnight Black'),('006','Sage Green'),
        ],
        'design': [
            ('ECL','Eclipse'),('LUN','Luna'),('ARC','Arc'),('NOV','Nova'),('ZEN','Zen'),
        ],
    }

    for opt_type, items in defaults.items():
        for code, name in items:
            try:
                c.execute('INSERT INTO options (option_type, code, name) VALUES (?,?,?)',
                          (opt_type, code, name))
            except sqlite3.IntegrityError:
                pass

    # Seed component library with Eclipse lamp parts (new format: MATERIAL+TYPOLOGY+NUMBER, no color)
    components = [
        ('3DPEC001','Eclipse wall lamp light module','lighting','unit',1),
        ('3DPHA002','Eclipse wall lamp hook','hardware','unit',1),
        ('LEDLI001','LED strip (5m reel)','lighting','reel',5),
        ('DRIEC001','Driver','electronics','unit',1),
        ('PROHA001','Flexible profile (5m)','profile','reel',5),
        ('CERAE137','Eclipse 300ml pasta bowl','ceramic','unit',1),
        ('CERAE109','Luna 5.5in dessert plate','ceramic','unit',1),
    ]
    for sku, desc, cat, unit, reel in components:
        try:
            c.execute('INSERT INTO components (sku, description, category, unit, reel_size) VALUES (?,?,?,?,?)',
                      (sku, desc, cat, unit, reel))
        except sqlite3.IntegrityError:
            pass

    conn.commit()
    conn.close()

# ─── CONFIG ───────────────────────────────────────────────────────────────────

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {'zoho_client_id': '', 'zoho_client_secret': '', 'zoho_refresh_token': '', 'zoho_org_id': ''}

def save_config(data):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(data, f, indent=2)

# ─── ZOHO API ─────────────────────────────────────────────────────────────────

def get_zoho_access_token():
    cfg = load_config()
    if not cfg.get('zoho_refresh_token'):
        return None, 'Zoho not configured'
    r = requests.post('https://accounts.zoho.in/oauth/v2/token', data={
        'refresh_token': cfg['zoho_refresh_token'],
        'client_id': cfg['zoho_client_id'],
        'client_secret': cfg['zoho_client_secret'],
        'grant_type': 'refresh_token'
    })
    data = r.json()
    if 'access_token' in data:
        return data['access_token'], None
    return None, data.get('error', 'Unknown error')

def push_to_zoho(sku_code, product_name, is_composite=False, bom=None):
    token, err = get_zoho_access_token()
    if err:
        return False, err
    cfg = load_config()
    headers = {
        'Authorization': f'Zoho-oauthtoken {token}',
        'Content-Type': 'application/json'
    }
    payload = {
        'name': product_name,
        'sku': sku_code,
        'item_type': 'composite' if is_composite else 'inventory',
        'product_type': 'goods',
    }
    if is_composite and bom:
        payload['composite_item_components'] = [
            {'item_id': '', 'name': c['desc'], 'sku': c['sku'], 'quantity': c['qty']}
            for c in bom
        ]
    url = f'https://www.zohoapis.in/inventory/v1/items?organization_id={cfg["zoho_org_id"]}'
    r = requests.post(url, headers=headers, json=payload)
    resp = r.json()
    if resp.get('code') == 0:
        return True, resp['item']['item_id']
    return False, resp.get('message', 'Unknown error')

# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

# OPTIONS
@app.route('/api/options/<option_type>')
def get_options(option_type):
    conn = get_db()
    rows = conn.execute('SELECT code, name FROM options WHERE option_type=? ORDER BY code',
                        (option_type,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/options/<option_type>', methods=['POST'])
def add_option(option_type):
    data = request.json
    conn = get_db()
    try:
        conn.execute('INSERT INTO options (option_type, code, name) VALUES (?,?,?)',
                     (option_type, data['code'].upper(), data['name']))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'Code already exists'}), 400

@app.route('/api/options/<option_type>/<code>', methods=['DELETE'])
def delete_option(option_type, code):
    conn = get_db()
    conn.execute('DELETE FROM options WHERE option_type=? AND code=?', (option_type, code))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# INDIVIDUAL SKUs
@app.route('/api/skus', methods=['GET'])
def get_skus():
    search = request.args.get('search', '')
    conn = get_db()
    if search:
        rows = conn.execute(
            '''SELECT * FROM skus WHERE sku_code LIKE ? OR product_name LIKE ?
               ORDER BY created_at DESC''',
            (f'%{search}%', f'%{search}%')).fetchall()
    else:
        rows = conn.execute('SELECT * FROM skus ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

def _highest_existing(conn, typology_code):
    """Highest number currently present among live SKUs of this typology (fallback seed)."""
    rows = conn.execute('SELECT product_number FROM skus WHERE typology_code=?', (typology_code,)).fetchall()
    mx = 0
    for r in rows:
        try:
            v = int(r['product_number'])
        except (TypeError, ValueError):
            v = 0
        if v > mx:
            mx = v
    return mx

def _counter_value(conn, typology_code):
    """Current high-water mark for a typology, seeding from live SKUs if the counter doesn't exist yet."""
    row = conn.execute('SELECT last_number FROM typology_counters WHERE typology_code=?', (typology_code,)).fetchone()
    if row is not None:
        counter = int(row['last_number'])
    else:
        counter = 0
    # Never fall below what already exists (handles pre-existing/re-seeded data).
    existing = _highest_existing(conn, typology_code)
    return max(counter, existing)

def next_number_for_typology(conn, typology_code):
    """PEEK: what number the next SKU in this typology will get. Does not consume it."""
    return _counter_value(conn, typology_code) + 1

def claim_number_for_typology(conn, typology_code):
    """CLAIM: reserve and return the next number, permanently advancing the counter so it is never reused."""
    n = _counter_value(conn, typology_code) + 1
    conn.execute('''INSERT INTO typology_counters (typology_code, last_number) VALUES (?, ?)
                    ON CONFLICT(typology_code) DO UPDATE SET last_number=excluded.last_number''',
                 (typology_code, n))
    return n


@app.route('/api/next-number')
def get_next_number():
    """Front-end calls this when a typology is selected to show the auto-assigned number."""
    typ = request.args.get('typology_code', '')
    if not typ:
        return jsonify({'next_number': 1})
    conn = get_db()
    n = next_number_for_typology(conn, typ)
    conn.close()
    return jsonify({'next_number': n})


def _highest_existing_assembly(conn, category_code):
    """Highest sequence number currently present among live assemblies of this category (fallback seed)."""
    rows = conn.execute('SELECT seq_number FROM assembly_skus WHERE category_code=?', (category_code,)).fetchall()
    mx = 0
    for r in rows:
        try:
            v = int(r['seq_number'])
        except (TypeError, ValueError):
            v = 0
        if v > mx:
            mx = v
    return mx

def _counter_value_assembly(conn, category_code):
    """Current high-water mark for a category, seeding from live assemblies if the counter doesn't exist yet."""
    row = conn.execute('SELECT last_number FROM category_counters WHERE category_code=?', (category_code,)).fetchone()
    if row is not None:
        counter = int(row['last_number'])
    else:
        counter = 0
    existing = _highest_existing_assembly(conn, category_code)
    return max(counter, existing)

def next_number_for_category(conn, category_code):
    """PEEK: what number the next assembly in this category will get. Does not consume it."""
    return _counter_value_assembly(conn, category_code) + 1

def claim_number_for_category(conn, category_code):
    """CLAIM: reserve and return the next number, permanently advancing the counter so it is never reused."""
    n = _counter_value_assembly(conn, category_code) + 1
    conn.execute('''INSERT INTO category_counters (category_code, last_number) VALUES (?, ?)
                    ON CONFLICT(category_code) DO UPDATE SET last_number=excluded.last_number''',
                 (category_code, n))
    return n


@app.route('/api/next-assembly-number')
def get_next_assembly_number():
    """Front-end calls this when a category is selected to show the auto-assigned sequence number."""
    cat = request.args.get('category_code', '')
    if not cat:
        return jsonify({'next_number': 1})
    conn = get_db()
    n = next_number_for_category(conn, cat)
    conn.close()
    return jsonify({'next_number': n})


@app.route('/api/skus', methods=['POST'])
def save_sku():
    data = request.json
    conn = get_db()
    # Product number is assigned automatically by the server, scoped to typology, always climbing.
    # claim_number permanently advances the per-typology counter so deleted numbers are never reused.
    number = claim_number_for_typology(conn, data['typology_code'])
    # CMF/color is intentionally NOT part of the SKU identity.
    # Component SKU = MATERIAL + TYPOLOGY + NUMBER. Color is captured per order, not baked into the code.
    sku_code = (data['material_code'] +
                data['typology_code'] + str(number).zfill(3))
    try:
        conn.execute('''INSERT INTO skus
            (sku_code, product_name, material_code, material_name, color_code, color_name,
             typology_code, typology_name, product_number, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?)''',
            (sku_code, data.get('product_name',''), data['material_code'], data.get('material_name',''),
             data.get('color_code',''), data.get('color_name',''), data['typology_code'],
             data.get('typology_name',''), number, data.get('notes','')))
        conn.commit()
        sku_id = conn.execute('SELECT id FROM skus WHERE sku_code=?', (sku_code,)).fetchone()['id']
        conn.close()

        # Push to Zoho if requested
        if data.get('push_to_zoho'):
            ok, result = push_to_zoho(sku_code, data.get('product_name', sku_code))
            if ok:
                conn2 = get_db()
                conn2.execute('UPDATE skus SET zoho_item_id=?, zoho_synced=1 WHERE id=?', (result, sku_id))
                conn2.commit()
                conn2.close()
                return jsonify({'success': True, 'sku_code': sku_code, 'product_number': number, 'zoho_synced': True})
            else:
                return jsonify({'success': True, 'sku_code': sku_code, 'product_number': number, 'zoho_error': result})

        return jsonify({'success': True, 'sku_code': sku_code, 'product_number': number})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'SKU already exists'}), 400


@app.route('/api/skus/<int:sku_id>', methods=['PATCH'])
def update_sku(sku_id):
    """Only the product name is editable. Typology/material/number are part of the SKU code and stay locked."""
    data = request.json or {}
    new_name = (data.get('product_name') or '').strip()
    conn = get_db()
    row = conn.execute('SELECT id FROM skus WHERE id=?', (sku_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'SKU not found'}), 404
    conn.execute('UPDATE skus SET product_name=? WHERE id=?', (new_name, sku_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'product_name': new_name})

@app.route('/api/skus/<int:sku_id>', methods=['DELETE'])
def delete_sku(sku_id):
    conn = get_db()
    conn.execute('DELETE FROM skus WHERE id=?', (sku_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ASSEMBLY SKUs
@app.route('/api/assemblies', methods=['GET'])
def get_assemblies():
    search = request.args.get('search', '')
    conn = get_db()
    if search:
        rows = conn.execute(
            'SELECT * FROM assembly_skus WHERE sku_code LIKE ? OR product_name LIKE ? ORDER BY created_at DESC',
            (f'%{search}%', f'%{search}%')).fetchall()
    else:
        rows = conn.execute('SELECT * FROM assembly_skus ORDER BY created_at DESC').fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['bom'] = json.loads(d['bom']) if d['bom'] else []
        result.append(d)
    return jsonify(result)

@app.route('/api/assemblies', methods=['POST'])
def save_assembly():
    data = request.json
    conn = get_db()
    # Sequence number is assigned automatically by the server, scoped to category, always climbing.
    # claim_number permanently advances the per-category counter so deleted numbers are never reused.
    number = claim_number_for_category(conn, data['category_code'])
    seq_number = str(number).zfill(3)
    # Variant/colour is intentionally NOT part of the assembly SKU identity.
    # Assembly SKU = CATEGORY - DESIGN - SEQ. Colour is decided per order, not baked into the code.
    sku_code = f"{data['category_code']}-{data['design_code']}-{seq_number}"
    try:
        conn.execute('''INSERT INTO assembly_skus
            (sku_code, product_name, category_code, category_name, variant_code, variant_name,
             design_code, design_name, seq_number, bom, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (sku_code, data.get('product_name',''), data['category_code'], data.get('category_name',''),
             data.get('variant_code',''), data.get('variant_name',''), data['design_code'],
             data.get('design_name',''), seq_number,
             json.dumps(data.get('bom',[])), data.get('notes','')))
        conn.commit()
        asm_id = conn.execute('SELECT id FROM assembly_skus WHERE sku_code=?', (sku_code,)).fetchone()['id']
        conn.close()

        if data.get('push_to_zoho'):
            ok, result = push_to_zoho(sku_code, data.get('product_name', sku_code),
                                       is_composite=True, bom=data.get('bom',[]))
            if ok:
                conn2 = get_db()
                conn2.execute('UPDATE assembly_skus SET zoho_item_id=?, zoho_synced=1 WHERE id=?', (result, asm_id))
                conn2.commit()
                conn2.close()
                return jsonify({'success': True, 'sku_code': sku_code, 'zoho_synced': True})
            else:
                return jsonify({'success': True, 'sku_code': sku_code, 'zoho_error': result})

        return jsonify({'success': True, 'sku_code': sku_code})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'Assembly SKU already exists'}), 400

@app.route('/api/assemblies/<int:asm_id>', methods=['DELETE'])
def delete_assembly(asm_id):
    conn = get_db()
    conn.execute('DELETE FROM assembly_skus WHERE id=?', (asm_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# COMPONENTS
@app.route('/api/components', methods=['GET'])
def get_components():
    conn = get_db()
    rows = conn.execute('SELECT * FROM components ORDER BY sku').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/components', methods=['POST'])
def add_component():
    data = request.json
    conn = get_db()
    try:
        conn.execute('INSERT INTO components (sku, description, category, unit, reel_size) VALUES (?,?,?,?,?)',
                     (data['sku'].upper(), data.get('description',''), data.get('category','other'),
                      data.get('unit','unit'), float(data.get('reel_size', 1))))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': 'Component SKU already exists'}), 400

@app.route('/api/components/<int:comp_id>', methods=['DELETE'])
def delete_component(comp_id):
    conn = get_db()
    conn.execute('DELETE FROM components WHERE id=?', (comp_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# STATS
@app.route('/api/stats')
def get_stats():
    conn = get_db()
    total_skus = conn.execute('SELECT COUNT(*) as c FROM skus').fetchone()['c']
    total_assemblies = conn.execute('SELECT COUNT(*) as c FROM assembly_skus').fetchone()['c']
    synced_today = conn.execute(
        "SELECT COUNT(*) as c FROM skus WHERE zoho_synced=1 AND date(created_at)=date('now')").fetchone()['c']
    pending = conn.execute('SELECT COUNT(*) as c FROM skus WHERE zoho_synced=0').fetchone()['c']
    conn.close()
    return jsonify({
        'total_skus': total_skus,
        'total_assemblies': total_assemblies,
        'synced_today': synced_today,
        'pending_sync': pending
    })

# CONFIG / ZOHO SETUP
@app.route('/api/config', methods=['GET'])
def get_config():
    cfg = load_config()
    # Don't expose secrets fully
    safe = {k: ('***' if 'secret' in k.lower() and v else v) for k, v in cfg.items()}
    return jsonify(safe)

@app.route('/api/config', methods=['POST'])
def update_config():
    data = request.json
    cfg = load_config()
    cfg.update(data)
    save_config(cfg)
    return jsonify({'success': True})

@app.route('/api/zoho/exchange', methods=['POST'])
def exchange_zoho_code():
    data = request.json
    cfg = load_config()
    r = requests.post('https://accounts.zoho.in/oauth/v2/token', data={
        'code': data['code'],
        'client_id': cfg['zoho_client_id'],
        'client_secret': cfg['zoho_client_secret'],
        'redirect_uri': 'https://www.zoho.com/inventory',
        'grant_type': 'authorization_code'
    })
    resp = r.json()
    if 'refresh_token' in resp:
        cfg['zoho_refresh_token'] = resp['refresh_token']
        save_config(cfg)
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': resp.get('error', 'Exchange failed')}), 400

@app.route('/api/zoho/test', methods=['GET'])
def test_zoho():
    token, err = get_zoho_access_token()
    if err:
        return jsonify({'connected': False, 'error': err})
    return jsonify({'connected': True})

# CSV EXPORT
@app.route('/api/export/skus')
def export_skus():
    import csv, io
    conn = get_db()
    rows = conn.execute('SELECT * FROM skus ORDER BY created_at DESC').fetchall()
    conn.close()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['SKU Code','Product Name','Material','Typology','Number','Notes','Zoho Synced','Created'])
    for r in rows:
        writer.writerow([r['sku_code'],r['product_name'],f"{r['material_code']} - {r['material_name']}",
                         f"{r['typology_code']} - {r['typology_name']}",
                         r['product_number'],r['notes'],'Yes' if r['zoho_synced'] else 'No',r['created_at']])
    from flask import Response
    return Response(output.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': 'attachment;filename=ware-skus.csv'})

if __name__ == '__main__':
    init_db()
    print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print('  ware SKU Studio is running')
    print('  Open: http://localhost:5050')
    print('  Network: http://0.0.0.0:5050')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    app.run(debug=True, host='0.0.0.0', port=5050)
