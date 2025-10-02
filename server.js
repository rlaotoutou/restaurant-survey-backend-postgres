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
      store_identifier TEXT UNIQUE NOT NULL,
      update_count INTEGER DEFAULT 0,
      store_name TEXT,
      business_type TEXT,
      store_area INTEGER,
      business_circle TEXT,
      decoration_level TEXT,
      monthly_revenue BIGINT,
      daily_customers INTEGER,
      seats INTEGER,
      food_cost BIGINT,
      labor_cost BIGINT,
      rent_cost BIGINT,
      online_revenue BIGINT,
      main_platforms TEXT,
      marketing_situation TEXT,
      total_customers INTEGER,
      repeat_customers INTEGER,
      utility_cost BIGINT,
      marketing_cost BIGINT,
      average_rating REAL,
      total_reviews INTEGER,
      bad_reviews INTEGER,
      service_bad_reviews INTEGER,
      taste_bad_reviews INTEGER,
      short_video_count INTEGER,
      live_stream_count INTEGER,
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

// 新增API: 检查门店识别码状态
app.get('/api/survey/status/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier;
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    const result = await pool.query(
      'SELECT update_count FROM surveys WHERE store_identifier = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.json({ exists: false, update_count: 0 });
    }

    res.json({ 
      exists: true, 
      update_count: result.rows[0].update_count 
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 新增API: 获取门店调查数据
app.get('/api/survey/data/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier;
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    const result = await pool.query(
      'SELECT * FROM surveys WHERE store_identifier = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    const data = result.rows[0];
    // 转换数据库字段名为前端期望的驼峰命名
    res.json({
      storeIdentifier: data.store_identifier,
      storeName: data.store_name,
      businessType: data.business_type,
      storeArea: data.store_area,
      businessCircle: data.business_circle,
      decorationLevel: data.decoration_level,
      monthlyRevenue: data.monthly_revenue,
      dailyCustomers: data.daily_customers,
      seats: data.seats,
      foodCost: data.food_cost,
      laborCost: data.labor_cost,
      rentCost: data.rent_cost,
      onlineRevenue: data.online_revenue,
      mainPlatforms: data.main_platforms,
      marketingSituation: data.marketing_situation,
      totalCustomers: data.total_customers,
      repeatCustomers: data.repeat_customers,
      utilityCost: data.utility_cost,
      marketingCost: data.marketing_cost,
      averageRating: data.average_rating,
      totalReviews: data.total_reviews,
      badReviews: data.bad_reviews,
      serviceBadReviews: data.service_bad_reviews,
      tasteBadReviews: data.taste_bad_reviews,
      shortVideoCount: data.short_video_count,
      liveStreamCount: data.live_stream_count
    });
  } catch (err) {
    console.error('Data fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 修改: 提交/更新调查数据 (Upsert)
app.post('/api/saveSurvey', async (req, res) => {
  try {
    const b = req.body || {};
    
    // 验证必需字段
    const storeIdentifier = toTextOrNull(b.storeIdentifier);
    if (!storeIdentifier) {
      return res.status(400).json({ error: 'Store identifier is required' });
    }

    // 检查是否已存在
    const checkResult = await pool.query(
      'SELECT id, update_count FROM surveys WHERE store_identifier = $1',
      [storeIdentifier]
    );

    const data = {
      store_identifier: storeIdentifier,
      store_name: toTextOrNull(b.storeName),
      business_type: toTextOrNull(b.businessType),
      store_area: toIntOrNull(b.storeArea),
      business_circle: toTextOrNull(b.businessCircle),
      decoration_level: toTextOrNull(b.decorationLevel),
      monthly_revenue: toIntOrNull(b.monthlyRevenue),
      daily_customers: toIntOrNull(b.dailyCustomers),
      seats: toIntOrNull(b.seats),
      food_cost: toIntOrNull(b.foodCost),
      labor_cost: toIntOrNull(b.laborCost),
      rent_cost: toIntOrNull(b.rentCost),
      online_revenue: toIntOrNull(b.onlineRevenue),
      main_platforms: toTextOrNull(b.mainPlatforms),
      marketing_situation: toTextOrNull(b.marketingSituation),
      total_customers: toIntOrNull(b.totalCustomers),
      repeat_customers: toIntOrNull(b.repeatCustomers),
      utility_cost: toIntOrNull(b.utilityCost),
      marketing_cost: toIntOrNull(b.marketingCost),
      average_rating: toFloatOrNull(b.averageRating),
      total_reviews: toIntOrNull(b.totalReviews),
      bad_reviews: toIntOrNull(b.badReviews),
      service_bad_reviews: toIntOrNull(b.serviceBadReviews),
      taste_bad_reviews: toIntOrNull(b.tasteBadReviews),
      short_video_count: toIntOrNull(b.shortVideoCount),
      live_stream_count: toIntOrNull(b.liveStreamCount),
      user_agent: req.get('user-agent') || null,
      ip: req.ip || 'unknown'
    };

    let result;

    if (checkResult.rows.length === 0) {
      // 新用户 - INSERT
      const sql = `INSERT INTO surveys (
        store_identifier, update_count, store_name, business_type, store_area, 
        business_circle, decoration_level, monthly_revenue, daily_customers, seats,
        food_cost, labor_cost, rent_cost, online_revenue, main_platforms,
        marketing_situation, total_customers, repeat_customers, utility_cost, 
        marketing_cost, average_rating, total_reviews, bad_reviews, 
        service_bad_reviews, taste_bad_reviews, short_video_count, 
        live_stream_count, user_agent, ip
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29
      ) RETURNING id, timestamp`;

      const params = [
        data.store_identifier, 0, data.store_name, data.business_type, data.store_area,
        data.business_circle, data.decoration_level, data.monthly_revenue, 
        data.daily_customers, data.seats, data.food_cost, data.labor_cost, 
        data.rent_cost, data.online_revenue, data.main_platforms,
        data.marketing_situation, data.total_customers, data.repeat_customers,
        data.utility_cost, data.marketing_cost, data.average_rating, 
        data.total_reviews, data.bad_reviews, data.service_bad_reviews,
        data.taste_bad_reviews, data.short_video_count, data.live_stream_count,
        data.user_agent, data.ip
      ];

      result = await pool.query(sql, params);
      
    } else {
      // 老用户 - 检查更新次数
      const currentCount = checkResult.rows[0].update_count;
      if (currentCount >= 3) {
        return res.status(403).json({ 
          error: 'Update limit reached. Maximum 3 updates allowed.' 
        });
      }

      // UPDATE
      const sql = `UPDATE surveys SET
        store_name=$1, business_type=$2, store_area=$3, business_circle=$4,
        decoration_level=$5, monthly_revenue=$6, daily_customers=$7, seats=$8,
        food_cost=$9, labor_cost=$10, rent_cost=$11, online_revenue=$12,
        main_platforms=$13, marketing_situation=$14, total_customers=$15,
        repeat_customers=$16, utility_cost=$17, marketing_cost=$18,
        average_rating=$19, total_reviews=$20, bad_reviews=$21,
        service_bad_reviews=$22, taste_bad_reviews=$23, short_video_count=$24,
        live_stream_count=$25, update_count=$26, timestamp=NOW(),
        user_agent=$27, ip=$28
      WHERE store_identifier=$29
      RETURNING id, timestamp`;

      const params = [
        data.store_name, data.business_type, data.store_area, data.business_circle,
        data.decoration_level, data.monthly_revenue, data.daily_customers, data.seats,
        data.food_cost, data.labor_cost, data.rent_cost, data.online_revenue,
        data.main_platforms, data.marketing_situation, data.total_customers,
        data.repeat_customers, data.utility_cost, data.marketing_cost,
        data.average_rating, data.total_reviews, data.bad_reviews,
        data.service_bad_reviews, data.taste_bad_reviews, data.short_video_count,
        data.live_stream_count, currentCount + 1, data.user_agent, data.ip,
        data.store_identifier
      ];

      result = await pool.query(sql, params);
    }

    res.json({ 
      ok: true, 
      id: result.rows[0].id, 
      timestamp: result.rows[0].timestamp 
    });
    
  } catch (err) {
    console.error('DB save error:', err);
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({ error: 'Store identifier already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/surveys', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const result = await pool.query('SELECT * FROM surveys ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset]);
    
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
      'id','timestamp','store_identifier','update_count','store_name','business_type',
      'store_area','business_circle','decoration_level','monthly_revenue','daily_customers',
      'seats','food_cost','labor_cost','rent_cost','online_revenue','main_platforms',
      'marketing_situation','total_customers','repeat_customers','utility_cost',
      'marketing_cost','average_rating','total_reviews','bad_reviews','service_bad_reviews',
      'taste_bad_reviews','short_video_count','live_stream_count','user_agent','ip'
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

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
