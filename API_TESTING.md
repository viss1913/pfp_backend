# API Testing Guide

## 🔐 Authentication

### 1. Login (Get JWT Token)

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "admin@pfp.local",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@pfp.local",
    "name": "System Administrator",
    "role": "admin",
    "agentId": null
  }
}
```

**Copy the `token` value** - you'll need it for all other requests!

---

## 📋 Using the API

### Option 1: Swagger UI (Recommended)

1. Open `https://your-railway-url.railway.app/api-docs`
2. Click **"Authorize"** button (top right)
3. Enter: `Bearer YOUR_TOKEN_HERE`
4. Click **"Authorize"**
5. Now you can test all endpoints!

### Option 2: cURL

Add the token to every request:

```bash
curl https://your-url.railway.app/api/pfp/products \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Option 3: Postman

1. Create new request
2. Go to **Authorization** tab
3. Select **Bearer Token**
4. Paste your token
5. Send request

---

## 🧪 Test Scenarios

### Scenario 1: Admin creates a new product

```bash
# 1. Login as admin
POST /api/auth/login
{
  "email": "admin@pfp.local",
  "password": "admin123"
}

# 2. Create product (use token from step 1)
POST /api/pfp/products
Authorization: Bearer <token>
{
  "name": "НСЖ Альфа",
  "product_type": "NSJ",
  "currency": "RUB",
  "min_term_months": 12,
  "max_term_months": 120,
  "min_amount": 50000,
  "max_amount": 10000000,
  "is_default": false,
  "yields": [
    {
      "term_from_months": 12,
      "term_to_months": 60,
      "amount_from": 50000,
      "amount_to": 10000000,
      "yield_percent": 8.5
    }
  ]
}

# 3. List all products
GET /api/pfp/products
Authorization: Bearer <token>
```

### Scenario 2: Create a portfolio

```bash
POST /api/pfp/portfolios
Authorization: Bearer <token>
{
  "name": "Агрессивный рост",
  "currency": "RUB",
  "amount_from": 100000,
  "amount_to": 50000000,
  "term_from_months": 60,
  "term_to_months": 240,
  "is_default": false,
  "classes": [2],  # Passive Income
  "riskProfiles": [
    {
      "profile_type": "AGGRESSIVE",
      "potential_yield_percent": 15.0,
      "instruments": [
        {
          "product_id": 1,
          "bucket_type": "INITIAL_CAPITAL",
          "share_percent": 100,
          "order_index": 1
        }
      ]
    }
  ]
}
```

### Scenario 3: Update system settings (Admin only)

```bash
PUT /api/pfp/settings/inflation_rate_monthly
Authorization: Bearer <token>
{
  "value": 0.40
}
```

### Scenario 4: Register new agent user

```bash
POST /api/auth/register
{
  "email": "agent@example.com",
  "password": "secure123",
  "name": "John Agent",
  "agentId": 1
}
```

---

## 🔒 Security Features

### Role-Based Access Control

| Action | Admin | Agent |
|--------|-------|-------|
| View own products | ✅ | ✅ |
| View default products | ✅ | ✅ |
| Create product | ✅ | ✅ |
| Edit own product | ✅ | ✅ |
| Edit default product | ✅ | ❌ |
| Delete own product | ✅ | ✅ |
| Delete default product | ✅ | ❌ |
| Manage settings | ✅ | ❌ |
| Clone default product | ✅ | ✅ |

### Token Expiration

- JWT tokens expire after **24 hours**
- After expiration, login again to get a new token

### Backward Compatibility

Legacy authentication with headers still works:
```bash
curl https://your-url.railway.app/api/pfp/products \
  -H "x-agent-id: 1" \
  -H "x-role: admin"
```

---

## 🐛 Troubleshooting

### "Invalid or expired token"
- Token expired (24h limit)
- Token format incorrect (must be `Bearer <token>`)
- Solution: Login again

### "Access denied"
- Agent trying to edit default products
- Agent trying to access settings
- Solution: Use admin account

### "Authentication required"
- No Authorization header
- No x-agent-id header
- Solution: Add Bearer token or headers

---

## 📊 Default Data

After running `npm run seed`:

### Users:
- **Admin:** admin@pfp.local / admin123

### Products:
- ПДС НПФ (12% yield)

### Portfolios:
- Пенсия
- Пассивный доход
- Инвестиции
- Прочее

### Settings:
- inflation_rate_monthly: 0.33
- pension_* parameters

---

## 🚀 Quick Start

1. **Deploy to Railway** (migrations run automatically)
2. **Run seeds:**
   ```bash
   npm run seed
   ```
3. **Open Swagger UI:**
   ```
   https://your-url.railway.app/api-docs
   ```
4. **Login:**
   - Use `/api/auth/login`
   - Email: `admin@pfp.local`
   - Password: `admin123`
5. **Authorize in Swagger:**
   - Click "Authorize"
   - Enter: `Bearer <your_token>`
6. **Test endpoints!**

---

## 📝 Notes

- All timestamps are in UTC
- All amounts are in the specified currency (RUB by default)
- Yields are in percent (e.g., 12.00 = 12%)
- Terms are in months
