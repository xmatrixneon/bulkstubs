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
- **User** - API key authentication
- **Numbers** - Phone numbers with quality/suspension tracking
- **Orders** - SMS activation orders with message queue and timeout
- **Service** - Target services (WhatsApp, Telegram, etc.) with format templates
- **Country** - Countries with dial codes
- **Lock** - Manual number locking per country/service combination

### Smart Number Allocation (buynumber)

Number allocation runs up to 6 retry attempts with these validation checks:

1. **Lock check** - Number not manually locked for this country/service
2. **Active order check** - No existing active order for this number/country/service
3. **Recent usage check** - No order used within 4 hours for this number/country/service
4. **Cooldown check** - No canceled order within random 5-20 minute cooldown window

Cooldowntimes are stored in `order.cooldownUntil` to avoid recalculation.

### Order Lifecycle

- **Creation** (getNumber): Active order with empty message array
- **Timeout**: Auto-cancels after 20 minutes
- **Completion** (getStatus): Returns `STATUS_OK:{otp}` when messages arrive
- **Early cancel protection**: Cancels within 2 minutes of creation are denied
- **Cooldown**: Canceled orders enter 5-20 minute cooldown before number reuse
- **Multi-SMS**: Services can support multiple messages via `setStatus` with status=3

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
