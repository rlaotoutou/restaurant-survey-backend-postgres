import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();
const app = express();
app.set('trust proxy', true);

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_KEY = process.env.ADMIN_KEY || null;
const DATABASE_URL = process.env.DATABASE_URL || null;

if (!DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL not set. The app will fail to connect to Postgres.');
}

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_ORIGIN === '*') return cb(null, true);
    const allowed = CORS_ORIGIN.split(',').map(s => s.trim());
    return cb(null, allowed.includes(origin));
  }
}));
app.use(morgan('tiny'));
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120
}));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDb() {
  try {
    const create = `CREATE TABLE IF NOT EXISTS surveys (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      store_name TEXT,
      business_type TEXT,
      monthly_revenue BIGINT,
      food_cost BIGINT,
      labor_cost BIGINT,
      rent_cost BIGINT,
      daily_customers INTEGER,
      seats INTEGER,
      online_revenue BIGINT,
      marketing_cost BIGINT,
      repeat_purchases INTEGER,
      total_customers INTEGER,
      utility_cost BIGINT,
      average_rating REAL,
      bad_reviews INTEGER,
      total_reviews INTEGER,
      social_media_mentions INTEGER,
      service_bad_review_rate REAL,
      taste_bad_review_rate REAL,
      user_agent TEXT,
      ip TEXT
    )`;
    await pool.query(create);
    console.log('Database table initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database table:', error);
    throw error;
  }
}

// 添加优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  await pool.end();
  process.exit(0);
});

initDb().catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return res.status(501).json({ error: 'ADMIN_KEY not set on server' });
  const key = req.get('x-admin-key') || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloatOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toTextOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

app.get('/api/health', async (req, res) => {
  try {
    // 测试数据库连接
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({ 
      ok: true, 
      time: new Date().toISOString(),
      database: 'connected',
      db_time: result.rows[0].current_time
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(500).json({ 
      ok: false, 
      time: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

app.post('/api/saveSurvey', async (req, res) => {
  try {
    const b = req.body || {};
    const data = {
      store_name: toTextOrNull(b.storeName),
      business_type: toTextOrNull(b.businessType),
      monthly_revenue: toIntOrNull(b.monthlyRevenue),
      food_cost: toIntOrNull(b.foodCost),
      labor_cost: toIntOrNull(b.laborCost),
      rent_cost: toIntOrNull(b.rentCost),
      daily_customers: toIntOrNull(b.dailyCustomers),
      seats: toIntOrNull(b.seats),
      online_revenue: toIntOrNull(b.onlineRevenue),
      marketing_cost: toIntOrNull(b.marketingCost),
      repeat_purchases: toIntOrNull(b.repeatPurchases),
      total_customers: toIntOrNull(b.totalCustomers),
      utility_cost: toIntOrNull(b.utilityCost),
      average_rating: toFloatOrNull(b.averageRating),
      bad_reviews: toIntOrNull(b.badReviews),
      total_reviews: toIntOrNull(b.totalReviews),
      social_media_mentions: toIntOrNull(b.socialMediaMentions),
      service_bad_review_rate: toFloatOrNull(b.serviceBadReviewRate),
      taste_bad_review_rate: toFloatOrNull(b.tasteBadReviewRate),
      user_agent: req.get('user-agent') || null,
      ip: req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
           (req.connection.socket ? req.connection.socket.remoteAddress : null) || 'unknown'
    };

    const sql = `INSERT INTO surveys (
      store_name, business_type, monthly_revenue, food_cost, labor_cost, rent_cost,
      daily_customers, seats, online_revenue, marketing_cost, repeat_purchases, total_customers,
      utility_cost, average_rating, bad_reviews, total_reviews, social_media_mentions,
      service_bad_review_rate, taste_bad_review_rate, user_agent, ip
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    ) RETURNING id, timestamp`;

    const params = [
      data.store_name, data.business_type, data.monthly_revenue, data.food_cost, data.labor_cost,
      data.rent_cost, data.daily_customers, data.seats, data.online_revenue, data.marketing_cost,
      data.repeat_purchases, data.total_customers, data.utility_cost, data.average_rating,
      data.bad_reviews, data.total_reviews, data.social_media_mentions, data.service_bad_review_rate,
      data.taste_bad_review_rate, data.user_agent, data.ip
    ];

    const result = await pool.query(sql, params);
    res.json({ 
      ok: true, 
      id: result.rows[0].id, 
      timestamp: result.rows[0].timestamp 
    });
  } catch (err) {
    console.error('DB insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/surveys', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const result = await pool.query('SELECT * FROM surveys ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset]);
    
    // 获取总数
    const countResult = await pool.query('SELECT COUNT(*) as total FROM surveys');
    const total = parseInt(countResult.rows[0].total);
    
    res.json({ 
      rows: result.rows, 
      limit, 
      offset, 
      total,
      count: result.rows.length
    });
  } catch (err) {
    console.error('DB list error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/export', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM surveys ORDER BY id ASC');
    const header = [
      'id','timestamp','store_name','business_type','monthly_revenue','food_cost','labor_cost','rent_cost',
      'daily_customers','seats','online_revenue','marketing_cost','repeat_purchases','total_customers',
      'utility_cost','average_rating','bad_reviews','total_reviews','social_media_mentions',
      'service_bad_review_rate','taste_bad_review_rate','user_agent','ip'
    ];
    
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    
    const lines = [header.join(',')];
    for (const r of result.rows) {
      lines.push(header.map(h => esc(r[h])).join(','));
    }
    
    const csv = lines.join('\n');
    const filename = `surveys_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('DB export error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 404 处理
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// 全局错误处理
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});