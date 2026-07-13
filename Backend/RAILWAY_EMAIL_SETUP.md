# Railway OTP Fix — READ THIS

## Your errors explained

| Log error | Cause | Fix |
|-----------|-------|-----|
| `Connection timeout` | Railway **blocks Gmail SMTP** ports | Use **Resend API** |
| `X-Forwarded-For` rate limit | Express trust proxy missing | **Fixed in code** |

## Steps (5 minutes)

### 1. Get Resend API key (FREE)
1. Open https://resend.com
2. Sign up → **API Keys** → Create key
3. Copy key (starts with `re_`)

### 2. Railway Variables — add these 2:
```
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=HexaChat <onboarding@resend.dev>
```

### 3. Remove Gmail SMTP vars (optional but recommended):
Delete from Railway if set:
- EMAIL_HOST
- EMAIL_PORT  
- EMAIL_USER
- EMAIL_PASS

### 4. Redeploy on Railway

### 5. Test
Open: `https://hexachat-production-87c1.up.railway.app/api/health/email`

Should show:
```json
{ "email": { "provider": "resend", "ready": true } }
```

Then signup on https://hexachat2.netlify.app — OTP email will arrive.

## Code fixes included
- `app.set('trust proxy', 1)` — fixes rate limit crash
- Resend API as primary email (works on Railway)
- Gmail SMTP disabled as primary (blocked on cloud)
