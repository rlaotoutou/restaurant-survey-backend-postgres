# Restaurant Survey Backend (Express + Postgres) — Railway Ready

This project replaces the previous SQLite backend with Postgres so you can persist data on Railway without Volumes.

## 1) Local run (for development)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a local Postgres connection (e.g. `postgres://user:pass@localhost:5432/dbname`)
   ```bash
   cp .env.example .env
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Health check:
   ```bash
   curl http://localhost:3000/api/health
   ```

## 2) Deploy on Railway (recommended)
1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub** → choose this repo.
3. Add a **Postgres** database to the same project (Project Canvas → + New → Database → PostgreSQL).
4. Railway will create a `DATABASE_URL` environment variable automatically.
5. In Railway project settings → Variables, ensure `CORS_ORIGIN` and `ADMIN_KEY` are set. `CORS_ORIGIN=*` is fine for testing.
6. Deploy. Railway will run `npm start` and your app will connect to Postgres.

## 3) API
- `GET /api/health` → `{ ok: true }`
- `POST /api/saveSurvey` → JSON body with fields from the form (see front-end integration below) → `{ ok: true, id, timestamp }`
- `GET /api/surveys?limit=100&offset=0` (admin) → requires header `x-admin-key: <ADMIN_KEY>` or query `?key=<ADMIN_KEY>`
- `GET /api/export` (admin) → CSV download, same auth as above.

## 4) Front-end hookup (inside your HTML)
Update your front-end to point to the Railway URL. Example snippet:
```html
<script>
  const API_BASE = 'https://your-railway-app.up.railway.app'; // replace with your Railway URL
  submitBtn.addEventListener('click', async function() {
    if (validateStep(currentStep)) {
      const formData = {
        storeName: document.getElementById('storeName').value,
        businessType: document.getElementById('businessType').value,
        monthlyRevenue: document.getElementById('monthlyRevenue').value,
        foodCost: document.getElementById('foodCost').value,
        laborCost: document.getElementById('laborCost').value,
        rentCost: document.getElementById('rentCost').value,
        dailyCustomers: document.getElementById('dailyCustomers').value,
        seats: document.getElementById('seats').value,
        onlineRevenue: document.getElementById('onlineRevenue').value,
        marketingCost: document.getElementById('marketingCost').value,
        repeatPurchases: document.getElementById('repeatPurchases').value,
        totalCustomers: document.getElementById('totalCustomers').value,
        utilityCost: document.getElementById('utilityCost').value,
        averageRating: document.getElementById('averageRating').value,
        badReviews: document.getElementById('badReviews').value,
        totalReviews: document.getElementById('totalReviews').value,
        socialMediaMentions: document.getElementById('socialMediaMentions').value,
        serviceBadReviewRate: document.getElementById('serviceBadReviewRate').value,
        tasteBadReviewRate: document.getElementById('tasteBadReviewRate').value
      };
      try {
        const resp = await fetch(`${API_BASE}/api/saveSurvey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || '提交失败');
        alert('数据已提交！记录编号：' + data.id);
        savedData.push({ ...formData, timestamp: new Date().toISOString() });
        currentStep++; showStep(currentStep);
      } catch (e) {
        alert('提交失败：' + e.message);
      }
    }
  });
</script>
```

## 5) Admin export example (curl)
```bash
curl -H "x-admin-key: $ADMIN_KEY" https://your-railway-app.up.railway.app/api/export -o surveys.csv
```
# restaurant-survey-backend-postgres
