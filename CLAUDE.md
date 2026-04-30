# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMS Gateway Stubs API - A lightweight Node.js/TypeScript API that mimics a PHP-based SMS activation service. It provides temporary phone numbers for OTP verification, with smart number allocation, cooldown tracking, and order management.

## Development Commands

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Regenerate Prisma client after schema changes
npm run prisma:generate
```

Production uses PM2 (configured in `ecosystem.config.cjs`).

## Architecture

### Single-Entry Action Router

All traffic routes through `/` with query parameter-based action dispatch:

- `action=getNumber` → `buynumber()` - Allocate a phone number for a service/country
- `action=getStatus` → `getsms()` - Retrieve OTP for an order
- `action=setStatus` → `setcancel()` - Cancel order or request next SMS (multi-use)

Responses are plain text strings (PHP API compatible) defined in `src/utils/responses.ts`.

### Database

MongoDB with Prisma ORM. Schema is shared with the main project - schema file is generated in `node_modules/.prisma/client/schema.prisma`.

Key models:
- **User** - API key authentication (`apikey` field)
- **Numbers** - Phone numbers with quality/suspension tracking
- **Orders** - SMS activation orders with message queue and timeout
- **Service** - Target services (Jiomart, WhatsApp, Telegram, etc.) with format templates
- **Country** - Countries with dial codes (e.g., India: code="22", dialcode=91)
- **Lock** - **AUTOMATIC** number locking when OTP is successfully received (NOT manual!)

### Smart Number Allocation (buynumber)

Number allocation runs up to **20 retry attempts** with these validation checks:

1. **Lock check** - Number not locked for this country/service combination
   - **Locks are created AUTOMATICALLY** when an order receives its first OTP
   - Once locked, a number won't be assigned again for the same service/country
   - To unlock: Remove the document from the `Lock` collection

2. **Active order check** - No existing active order (`active=true, isused=false`) for this number/country/service

3. **Cooldown check** - No canceled order within random 5-20 minute cooldown window
   - Applies to canceled orders (`active=false, isused=false`)
   - Cooldown stored in `order.cooldownUntil` to avoid recalculation

**REMOVED:** 4-hour recent usage check - numbers with `isused=true` can be reassigned immediately for different services (but remain locked for the same service via Lock collection)

**Allocation improvements:**
- 20 retries (increased from 6)
- 50 candidates per query (increased from 20)
- Tracks tried numbers in Set to avoid duplicate checks

### Order Lifecycle

- **Creation** (getNumber): Active order with empty message array
- **Timeout**: Auto-cancels after 20 minutes
- **Completion** (getStatus): Returns `STATUS_OK:{otp}` when messages arrive
- **Early cancel protection**: Cancels within 2 minutes of creation are denied
- **Cooldown**: Canceled orders enter 5-20 minute cooldown before number reuse
- **Multi-SMS**: Services can support multiple messages via `setStatus` with status=3

### Lock Behavior (Important!)

**Locks are AUTOMATIC, not manual:**
- Created by `worker:fetch` when an order receives its **first OTP**
- Lock is specific to: number + country + service combination
- Once locked, the number cannot be assigned again for that same service/country
- To unlock: `db.Lock.deleteOne({number, countryid, serviceid})`

**Why locks exist:**
- Prevents the same number from being reused for the same service
- Numbers can still be used for DIFFERENT services (only locked per service/country combo)
- This is a quality/safety feature to avoid number reuse detection

**Example:**
- Number 91987654321 receives OTP for Jiomart
- Lock created: `{number: 91987654321, countryid: india_id, serviceid: jiomart_id}`
- Same number CAN still be assigned for WhatsApp, Telegram, etc.
- Same number CANNOT be assigned for Jiomart again (unless lock is removed)

### Response Format

All responses are colon-delimited strings:
- `ACCESS_NUMBER:{orderId}:{dialcode}{number}` - Successful number allocation
- `STATUS_OK:{otp}` - OTP retrieved (colons stripped from message)
- Error codes: `BAD_KEY`, `NO_NUMBER`, `STATUS_WAIT_CODE`, etc.

### Environment

Required environment variables:
- `DATABASE_URL` - MongoDB connection string (replica set)
- `PORT` - Server port (default 5000)
- `NODE_ENV` - Environment

### Database Collection Names

MongoDB collections (case-sensitive):
- `user` (lowercase) - User accounts with API keys
- `Numbers` - Phone numbers
- `Orders` - SMS orders
- `Service` - Target services
- `Country` - Countries
- `Lock` - Number locks (per service/country)
- `Message` - SMS messages
- `Device` - Android devices
- `BulkCampaign`, `BulkMessage` - Bulk SMS campaigns

### PHP vs TypeScript Differences

| Feature | PHP | TypeScript |
|---------|-----|------------|
| 4-hour recent usage check | ✅ Yes | ❌ Removed |
| Lock check | ✅ Yes | ✅ Yes |
| Active order check | ✅ Yes | ✅ Yes |
| Cooldown check | ✅ Yes | ✅ Yes |
| Retries | 6 | 20 |
| Candidates | 1 (random) | 50 (with skip logic) |

**Key difference:** PHP blocks numbers used within 4 hours for ANY service. TypeScript only blocks via Lock collection (same service only).

## Common Operations

### Check service/country IDs
```bash
mongosh sms-gateway --eval 'db.Service.findOne({code: "jiomart"})'
mongosh sms-gateway --eval 'db.Country.findOne({code: "22"})'
```

### Check locked numbers for a service
```bash
mongosh sms-gateway --eval '
db.Lock.find({
  serviceid: ObjectId("SERVICE_ID"),
  countryid: ObjectId("COUNTRY_ID"),
  locked: true
}, {number: 1}).toArray()
'
```

### Unlock a number
```bash
mongosh sms-gateway --eval '
db.Lock.deleteOne({
  number: Long("91987654321"),
  serviceid: ObjectId("SERVICE_ID"),
  countryid: ObjectId("COUNTRY_ID")
})
'
```

### Cancel all active orders for a service
```bash
mongosh sms-gateway --eval '
db.Orders.updateMany(
  {serviceid: ObjectId("SERVICE_ID"), active: true},
  {$set: {active: false, failureReason: "cancelled"}}
)
'
```

### Test the API
```bash
# Get number
curl "http://localhost:5000/?action=getNumber&api_key=YOUR_KEY&service=jiomart&country=22"

# Get SMS status
curl "http://localhost:5000/?action=getStatus&api_key=YOUR_KEY&id=ORDER_ID"

# Cancel order
curl "http://localhost:5000/?action=setStatus&api_key=YOUR_KEY&id=ORDER_ID&status=8"
```

## Monitoring

Check PM2 logs:
```bash
pm2 logs stubs-api --lines 50
pm2 logs stubs-api --err  # Error logs only
pm2 logs stubs-api --out  # Output logs only
```

## Recent Changes (2026-04-30)

1. **Fixed cooldownUntil field** - Added to Prisma schema, regenerated client
2. **Fixed _id reference** - Changed to `id` in orders.ts (Prisma maps _id to id)
3. **Removed 4-hour recent usage lock** - Numbers can be reused immediately after OTP (only Lock collection blocks same service)
4. **Improved allocation logic** - 20 retries, 50 candidates, skip tried numbers
5. **Added Prisma schema** - Copied from main project to `prisma/schema.prisma`

## Troubleshooting

**NO_NUMBER errors:**
- Check if enough numbers exist: `db.Numbers.countDocuments({active: true, countryid: ..., suspended: false})`
- Check locked count: `db.Lock.countDocuments({serviceid: ..., countryid: ...})`
- Check active orders: `db.Orders.countDocuments({active: true, serviceid: ...})`

**Prisma errors:**
- Regenerate client: `npm run prisma:generate`
- Rebuild: `npm run build`

**Service returns NO_ACTION:**
- Check action parameter spelling (getNumber, getStatus, setStatus)
- Check logs for errors: `pm2 logs stubs-api --err`
