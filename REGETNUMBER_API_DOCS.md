# Stubs API Documentation - regetNumber Endpoint

## Overview

The `regetNumber` endpoint allows you to reset an existing order's message state so you can receive OTP again for the **same phone number** and **same service**.

**Base URL:** `https://syncmesh-datacore.shop/stubs/handler_api.php`

---

## Endpoint

### regetNumber

Reset an order to receive OTP again on the same number/service.

**Method:** `GET`

**Parameters:**

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| action    | string | Yes      | Must be `regetNumber`                     |
| api_key   | string | Yes      | Your API key (format: `sk_...`)           |
| id        | string | Yes      | Order ID (returned by `getNumber`)        |

---

## Request Example

```bash
curl "https://syncmesh-datacore.shop/stubs/handler_api.php?action=regetNumber&api_key=sk_your_api_key_here&id=your_order_id"
```

**PHP Example:**
```php
$response = file_get_contents(
    "https://syncmesh-datacore.shop/stubs/handler_api.php?" .
    "action=regetNumber&api_key=sk_your_api_key_here&id=your_order_id"
);
echo $response;
```

**Python Example:**
```python
import requests

url = "https://syncmesh-datacore.shop/stubs/handler_api.php"
params = {
    "action": "regetNumber",
    "api_key": "sk_your_api_key_here",
    "id": "your_order_id"
}
response = requests.get(url, params=params)
print(response.text)
```

**JavaScript/Node.js Example:**
```javascript
const axios = require('axios');

const response = await axios.get('https://syncmesh-datacore.shop/stubs/handler_api.php', {
    params: {
        action: 'regetNumber',
        api_key: 'sk_your_api_key_here',
        id: 'your_order_id'
    }
});
console.log(response.data);
```

---

## Responses

### Success Response

**Response:** `REGET_NUMBER_OK`

The order has been successfully reset:
- Message array cleared
- `isused` set to `false`
- Same number/service preserved

### Error Responses

| Response            | Description                                                    |
|---------------------|----------------------------------------------------------------|
| `BAD_KEY`           | Invalid API key                                                |
| `NO_ACTIVATION`     | Order not found OR not yet used (`isused: false`) |
| `NO_ACTIVE_NUMBER`  | The number is inactive or suspended                           |
| `WRONG_ACTION`      | Invalid action parameter                                      |

---

## Complete Workflow Example

### 1. Get a Number

```bash
curl "https://syncmesh-datacore.shop/stubs/handler_api.php?action=getNumber&api_key=sk_xxx&service=telegram&country=22"
```

**Response:** `ACCESS_NUMBER:order_id:dialcode+number`

```bash
# Example response
ACCESS_NUMBER:69f461bb8b48cec8036de6e0:919243128140
```

### 2. Check Status (Get OTP)

```bash
curl "https://syncmesh-datacore.shop/stubs/handler_api.php?action=getStatus&api_key=sk_xxx&id=69f461bb8b48cec8036de6e0"
```

**Response:** `STATUS_OK:otp_code`

```bash
# Example response
STATUS_OK:123456
```

### 3. Reset Order (Get New OTP on Same Number)

```bash
curl "https://syncmesh-datacore.shop/stubs/handler_api.php?action=regetNumber&api_key=sk_xxx&id=69f461bb8b48cec8036de6e0"
```

**Response:** `REGET_NUMBER_OK`

### 4. Check Status Again (Get New OTP)

```bash
curl "https://syncmesh-datacore.shop/stubs/handler_api.php?action=getStatus&api_key=sk_xxx&id=69f461bb8b48cec8036de6e0"
```

**Response:** `STATUS_OK:new_otp_code` (once new SMS arrives)

---

## Important Notes

### Timeout Window
**`regetNumber` works on expired orders.** Even if the order timed out (past 20 minutes), you can still reset it to get a new OTP on the same number/service, as long as `isused: true`.

### Order State
- **Does NOT** change the phone number
- **Does NOT** change the service
- **Does NOT** extend the 20-minute timeout
- **DOES** clear the message array
- **DOES** reset `isused` to `false`

### Requirements
The order **must** meet these conditions:
- Order has already been used (`isused: true`) - meaning OTP was already received
- The phone number is active and not suspended

**Note:** Works even on expired/inactive orders (timeout), as long as `isused: true`

### When to Use
- OTP expired before verification
- Need to retry verification with same number/service
- User requested new OTP for same service
- Previous OTP was incorrect or not received in time

### When NOT to Use
- Fresh order that hasn't received OTP yet (will return `NO_ACTIVATION`)
- Number is no longer active
- You need a different phone number

---

## Response Codes Reference

| Code                | Meaning                                                                     | HTTP Status |
|---------------------|-----------------------------------------------------------------------------|-------------|
| `REGET_NUMBER_OK`   | Order successfully reset (only works when `isused: true`)                    | 200         |
| `BAD_KEY`           | Invalid API key                                                             | 200         |
| `NO_ACTIVATION`     | Order not found OR not yet used (`isused: false`)                | 200         |
| `NO_ACTIVE_NUMBER`  | Number inactive or suspended                                                | 200         |
| `WRONG_ACTION`      | Invalid action parameter                                                    | 200         |

**Note:** All responses return HTTP 200. Check the response body for the actual result.

---

## Rate Limits

- No specific rate limits for `regetNumber`
- Subject to overall API rate limits
- Recommended: Wait at least 5 seconds between calls

---

## Support

For issues or questions, contact your system administrator.

---

## Version

- **API Version:** 1.0
- **Last Updated:** 2026-05-01
- **Endpoint:** `regetNumber`
