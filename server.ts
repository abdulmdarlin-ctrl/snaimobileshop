
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// PostgreSQL Connection Pool
// Defaults to a standard local connection if env var is missing
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/sna_erp",
});

// Database Initialization
const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        full_name VARCHAR(100),
        phone VARCHAR(20),
        role VARCHAR(20) NOT NULL,
        password VARCHAR(255) NOT NULL,
        fingerprint_id VARCHAR(100),
        last_login BIGINT,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    // Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        brand VARCHAR(100),
        category VARCHAR(100),
        cost_price DECIMAL(15,2) DEFAULT 0,
        middle_man_price DECIMAL(15,2) DEFAULT 0,
        selling_price DECIMAL(15,2) DEFAULT 0,
        min_selling_price DECIMAL(15,2) DEFAULT 0,
        stock_quantity INT DEFAULT 0,
        reorder_level INT DEFAULT 5,
        supplier_id INT,
        location VARCHAR(100),
        warranty_period VARCHAR(50)
      )
    `);

    // Stock Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_logs (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(50) NOT NULL,
        product_name VARCHAR(255),
        previous_stock INT NOT NULL,
        new_stock INT NOT NULL,
        change_amount INT NOT NULL,
        reason VARCHAR(50) NOT NULL,
        note TEXT,
        "user" VARCHAR(100),
        timestamp BIGINT NOT NULL
      )
    `);

    // Expense Categories Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    // Expenses Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        amount DECIMAL(15,2) NOT NULL,
        date BIGINT NOT NULL,
        paid_by VARCHAR(100)
      )
    `);

    // Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        config JSONB NOT NULL
      )
    `);

    // Sales Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        receipt_no VARCHAR(50) UNIQUE NOT NULL,
        items JSONB NOT NULL,
        subtotal DECIMAL(15,2) DEFAULT 0,
        discount DECIMAL(15,2) DEFAULT 0,
        tax DECIMAL(15,2) DEFAULT 0,
        total DECIMAL(15,2) DEFAULT 0,
        amount_paid DECIMAL(15,2) DEFAULT 0,
        balance DECIMAL(15,2) DEFAULT 0,
        payment_method VARCHAR(50),
        cashier_name VARCHAR(100),
        customer_name VARCHAR(100),
        customer_phone VARCHAR(50),
        customer_type VARCHAR(50),
        timestamp BIGINT NOT NULL
      )
    `);

    // Repairs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS repairs (
        id SERIAL PRIMARY KEY,
        job_card_no VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100),
        customer_phone VARCHAR(50),
        device_model VARCHAR(100),
        issue TEXT,
        accessories_left JSONB,
        status VARCHAR(50),
        technician_id VARCHAR(100),
        estimated_cost DECIMAL(15,2) DEFAULT 0,
        deposit_paid DECIMAL(15,2) DEFAULT 0,
        parts_used JSONB,
        timestamp BIGINT NOT NULL,
        completion_date BIGINT,
        is_paid BOOLEAN DEFAULT FALSE
      )
    `);

    // Suppliers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        contact_person VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(100),
        address TEXT
      )
    `);

    // Seed Data
    const catCheck = await client.query('SELECT * FROM expense_categories LIMIT 1');
    if (catCheck.rows.length === 0) {
      const defaults = ['Rent', 'Utilities', 'Staff Lunch', 'Transport', 'Supplies', 'Taxes', 'Maintenance', 'Others'];
      for (const cat of defaults) {
        await client.query('INSERT INTO expense_categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
      }
    }

    const adminCheck = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      // Use fallback if env var is missing
      const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || '123456';
      await client.query(
        'INSERT INTO users (username, full_name, role, password, is_active) VALUES ($1, $2, $3, $4, $5)',
        ['admin', 'SNA Admin', 'Admin', adminPass, true]
      );
    }

    await client.query('COMMIT');
    console.log('✅ PostgreSQL Schema Verified & Synced.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database Init Failed:', err);
  } finally {
    client.release();
  }
};

initDb();

app.use(cors());
app.use(express.json() as any);

// --- PRODUCTS API ---
app.get('/api/v1/products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, sku, name, type, brand, category, cost_price as "costPrice", middle_man_price as "middleManPrice",
      selling_price, min_selling_price as "minSellingPrice", stock_quantity as "stockQuantity", 
      reorder_level as "reorderLevel", supplier_id as "supplierId", location, warranty_period as "warrantyPeriod"
      FROM products ORDER BY id ASC
    `);
    const products = result.rows.map(p => ({ ...p, id: p.id.toString(), costPrice: Number(p.costPrice), middleManPrice: Number(p.middleManPrice), selling_price: Number(p.selling_price), minSellingPrice: Number(p.minSellingPrice) }));
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/products', async (req, res) => {
  const { sku, name, type, brand, category, costPrice, middleManPrice, selling_price, minSellingPrice, stockQuantity, reorderLevel, supplierId, location, warrantyPeriod } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (sku, name, type, brand, category, cost_price, middle_man_price, selling_price, min_selling_price, stock_quantity, reorder_level, supplier_id, location, warranty_period) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [sku, name, type, brand, category, costPrice, middleManPrice, selling_price, minSellingPrice, stockQuantity, reorderLevel, supplierId, location, warrantyPeriod]
    );
    res.json({ id: result.rows[0].id.toString(), ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/v1/products/:id', async (req, res) => {
  const { id } = req.params;
  const { sku, name, type, brand, category, costPrice, middleManPrice, selling_price, minSellingPrice, stockQuantity, reorderLevel, supplierId, location, warrantyPeriod } = req.body;
  try {
    // Build dynamic query
    const fields = [];
    const values = [];
    let idx = 1;
    if (sku !== undefined) { fields.push(`sku=$${idx++}`); values.push(sku); }
    if (name !== undefined) { fields.push(`name=$${idx++}`); values.push(name); }
    if (type !== undefined) { fields.push(`type=$${idx++}`); values.push(type); }
    if (brand !== undefined) { fields.push(`brand=$${idx++}`); values.push(brand); }
    if (category !== undefined) { fields.push(`category=$${idx++}`); values.push(category); }
    if (costPrice !== undefined) { fields.push(`cost_price=$${idx++}`); values.push(costPrice); }
    if (middleManPrice !== undefined) { fields.push(`middle_man_price=$${idx++}`); values.push(middleManPrice); }
    if (selling_price !== undefined) { fields.push(`selling_price=$${idx++}`); values.push(selling_price); }
    if (minSellingPrice !== undefined) { fields.push(`min_selling_price=$${idx++}`); values.push(minSellingPrice); }
    if (stockQuantity !== undefined) { fields.push(`stock_quantity=$${idx++}`); values.push(stockQuantity); }
    if (reorderLevel !== undefined) { fields.push(`reorder_level=$${idx++}`); values.push(reorderLevel); }
    if (supplierId !== undefined) { fields.push(`supplier_id=$${idx++}`); values.push(supplierId); }
    if (location !== undefined) { fields.push(`location=$${idx++}`); values.push(location); }
    if (warrantyPeriod !== undefined) { fields.push(`warranty_period=$${idx++}`); values.push(warrantyPeriod); }

    values.push(id);
    await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/v1/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SALES API ---
app.get('/api/v1/sales', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, receipt_no as "receiptNo", items, subtotal, discount, tax, total, 
      amount_paid as "amountPaid", balance, payment_method as "paymentMethod",
      cashier_name as "cashierName", customer_name as "customerName", customer_type as "customerType",
      customer_phone as "customerPhone", timestamp 
      FROM sales ORDER BY timestamp DESC
    `);
    const sales = result.rows.map(s => ({ ...s, id: s.id.toString(), subtotal: Number(s.subtotal), total: Number(s.total) }));
    res.json(sales);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/sales', async (req, res) => {
  const s = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO sales (receipt_no, items, subtotal, discount, tax, total, amount_paid, balance, payment_method, cashier_name, customer_name, customer_phone, customer_type, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
    `, [s.receiptNo, JSON.stringify(s.items), s.subtotal, s.discount, s.tax, s.total, s.amountPaid, s.balance, s.paymentMethod, s.cashierName, s.customerName, s.customerPhone, s.customerType, s.timestamp]);
    res.json({ id: result.rows[0].id.toString(), ...s });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REPAIRS API ---
app.get('/api/v1/repairs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, job_card_no as "jobCardNo", customer_name as "customerName", customer_phone as "customerPhone",
      device_model as "deviceModel", issue, accessories_left as "accessoriesLeft", status, technician_id as "technicianId",
      estimated_cost as "estimatedCost", deposit_paid as "depositPaid", parts_used as "partsUsed",
      timestamp, completion_date as "completionDate", is_paid as "isPaid"
      FROM repairs ORDER BY timestamp DESC
    `);
    const repairs = result.rows.map(r => ({ ...r, id: r.id.toString(), estimatedCost: Number(r.estimatedCost), depositPaid: Number(r.depositPaid) }));
    res.json(repairs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/repairs', async (req, res) => {
  const r = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO repairs (job_card_no, customer_name, customer_phone, device_model, issue, accessories_left, status, technician_id, estimated_cost, deposit_paid, timestamp, completion_date, is_paid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id
    `, [r.jobCardNo, r.customerName, r.customerPhone, r.deviceModel, r.issue, JSON.stringify(r.accessoriesLeft), r.status, r.technicianId, r.estimatedCost, r.depositPaid, r.timestamp, r.completionDate, r.isPaid]);
    res.json({ id: result.rows[0].id.toString(), ...r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/v1/repairs/:id', async (req, res) => {
  const { id } = req.params;
  const r = req.body;
  try {
    await pool.query(`
      UPDATE repairs SET customer_name=$1, customer_phone=$2, device_model=$3, issue=$4, status=$5, technician_id=$6,
      estimated_cost=$7, deposit_paid=$8, accessories_left=$9, is_paid=$10, completion_date=$11 WHERE id=$12
    `, [r.customerName, r.customerPhone, r.deviceModel, r.issue, r.status, r.technicianId, r.estimatedCost, r.depositPaid, JSON.stringify(r.accessoriesLeft), r.isPaid, r.completionDate, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SUPPLIERS API ---
app.get('/api/v1/suppliers', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, name, contact_person as "contactPerson", phone, email, address FROM suppliers ORDER BY name`);
    res.json(result.rows.map(s => ({ ...s, id: s.id.toString() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/suppliers', async (req, res) => {
  const { name, contactPerson, phone, email, address } = req.body;
  try {
    const result = await pool.query(`INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, contactPerson, phone, email, address]);
    res.json({ id: result.rows[0].id.toString(), ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/v1/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, contactPerson, phone, email, address } = req.body;
  try {
    await pool.query(`UPDATE suppliers SET name=$1, contact_person=$2, phone=$3, email=$4, address=$5 WHERE id=$6`,
      [name, contactPerson, phone, email, address, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/v1/suppliers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- EXISTING ENDPOINTS (Preserved) ---
app.get('/api/v1/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT config FROM settings LIMIT 1');
    if (result.rows.length > 0) res.json({ id: '1', ...result.rows[0].config });
    else res.json(null);
  } catch (err) { res.status(500).json({ error: 'Database read error' }); }
});

app.put('/api/v1/settings', async (req, res) => {
  const config = req.body;
  try {
    const check = await pool.query('SELECT id FROM settings LIMIT 1');
    if (check.rows.length > 0) await pool.query('UPDATE settings SET config = $1 WHERE id = $2', [JSON.stringify(config), check.rows[0].id]);
    else await pool.query('INSERT INTO settings (config) VALUES ($1)', [JSON.stringify(config)]);
    res.json(config);
  } catch (err) { res.status(500).json({ error: 'Database update error' }); }
});

app.get('/api/v1/expense-categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expense_categories ORDER BY name ASC');
    res.json(result.rows.map(r => ({ ...r, id: r.id.toString() })));
  } catch (err) { res.status(500).json({ error: 'Database read error' }); }
});

app.post('/api/v1/expense-categories', async (req, res) => {
  try {
    const result = await pool.query('INSERT INTO expense_categories (name) VALUES ($1) RETURNING *', [req.body.name]);
    res.json({ ...result.rows[0], id: result.rows[0].id.toString() });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});
app.put('/api/v1/expense-categories/:id', async (req, res) => {
  try {
    const result = await pool.query('UPDATE expense_categories SET name = $1 WHERE id = $2 RETURNING *', [req.body.name, req.params.id]);
    res.json({ ...result.rows[0], id: result.rows[0].id.toString() });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});
app.delete('/api/v1/expense-categories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM expense_categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/v1/expenses', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, category, description, amount, date, paid_by as "paidBy" FROM expenses ORDER BY date DESC');
    res.json(result.rows.map(r => ({ ...r, id: r.id.toString(), amount: Number(r.amount), date: Number(r.date) })));
  } catch (err) { res.status(500).json({ error: 'Database read error' }); }
});

app.post('/api/v1/expenses', async (req, res) => {
  const { category, description, amount, date, paidBy } = req.body;
  try {
    const result = await pool.query('INSERT INTO expenses (category, description, amount, date, paid_by) VALUES ($1, $2, $3, $4, $5) RETURNING id', [category, description, amount, date, paidBy]);
    res.json({ id: result.rows[0].id.toString(), ...req.body });
  } catch (err) { res.status(500).json({ error: 'Insert error' }); }
});
app.put('/api/v1/expenses/:id', async (req, res) => {
  const { category, description, amount, date } = req.body;
  try {
    await pool.query('UPDATE expenses SET category=$1, description=$2, amount=$3, date=$4 WHERE id=$5', [category, description, amount, date, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/v1/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/stock-logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, product_id as "productId", product_name as "productName", previous_stock as "previousStock", new_stock as "newStock", change_amount as "changeAmount", reason, note, "user", timestamp FROM stock_logs ORDER BY timestamp DESC');
    res.json(result.rows.map(r => ({ ...r, id: r.id.toString(), timestamp: Number(r.timestamp) })));
  } catch (err) { res.status(500).json({ error: 'Database read error' }); }
});

app.post('/api/v1/stock-logs', async (req, res) => {
  const { productId, productName, previousStock, newStock, changeAmount, reason, note, user, timestamp } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO stock_logs (product_id, product_name, previous_stock, new_stock, change_amount, reason, note, "user", timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [productId, productName, previousStock, newStock, changeAmount, reason, note, user, timestamp]
    );
    res.json({ id: result.rows[0].id.toString(), ...req.body });
  } catch (err) { res.status(500).json({ error: 'Database insert error' }); }
});

app.post('/api/v1/reset', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE products, stock_logs, expenses, expense_categories, settings, sales, repairs, suppliers RESTART IDENTITY CASCADE');
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Reset failed' }); } finally { client.release(); }
});

app.post('/api/v1/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (user.is_active === false) return res.status(403).json({ error: 'Account Suspended' });
      if (user.password === password) {
        await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [Date.now(), user.id]);
        const { password: _, ...safeUser } = user;
        // Map snake to camel
        const mappedUser = {
          id: safeUser.id.toString(),
          username: safeUser.username,
          fullName: safeUser.full_name,
          phone: safeUser.phone,
          role: safeUser.role,
          fingerprintId: safeUser.fingerprint_id,
          lastLogin: Number(safeUser.last_login),
          isActive: safeUser.is_active
        };
        return res.json({ user: mappedUser, token: `sna-${Date.now()}` });
      }
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) { res.status(500).json({ error: 'Auth error' }); }
});

app.get('/api/v1/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, full_name, phone, role, fingerprint_id, last_login, is_active FROM users ORDER BY id ASC');
    const users = result.rows.map(u => ({
      id: u.id.toString(),
      username: u.username,
      fullName: u.full_name,
      phone: u.phone,
      role: u.role,
      fingerprintId: u.fingerprint_id,
      lastLogin: Number(u.last_login),
      isActive: u.is_active
    }));
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Read error' }); }
});

app.post('/api/v1/users', async (req, res) => {
  const { username, fullName, phone, role, password, fingerprintId, isActive } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (username, full_name, phone, role, password, fingerprint_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [username, fullName, phone, role, password, fingerprintId, isActive]
    );
    res.json({ id: result.rows[0].id.toString(), ...req.body });
  } catch (err) { res.status(500).json({ error: 'Create failed' }); }
});

app.put('/api/v1/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, fullName, phone, role, password, fingerprintId, isActive } = req.body;
  try {
    const fields = []; const vals = []; let idx = 1;
    if (fullName) { fields.push(`full_name=$${idx++}`); vals.push(fullName); }
    if (phone) { fields.push(`phone=$${idx++}`); vals.push(phone); }
    if (role) { fields.push(`role=$${idx++}`); vals.push(role); }
    if (password) { fields.push(`password=$${idx++}`); vals.push(password); }
    if (fingerprintId !== undefined) { fields.push(`fingerprint_id=$${idx++}`); vals.push(fingerprintId); }
    if (isActive !== undefined) { fields.push(`is_active=$${idx++}`); vals.push(isActive); }

    vals.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=$${idx}`, vals);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/v1/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => {
  console.log(`🚀 SNA! Mobile Backend active on port ${port}`);
});
