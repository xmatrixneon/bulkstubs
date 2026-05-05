import express from 'express';
import dotenv from 'dotenv';
import { buynumber, getsms, setcancel, regetnumber } from './routes/orders';
// Load environment variables
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
// Parse query parameters
app.get('/', async (req, res) => {
    const { action, api_key, service, country, id, status } = req.query;
    // Convert all query params to strings
    const apiKeyStr = api_key?.toString() || '';
    const serviceStr = service?.toString() || '';
    const countryStr = country?.toString() || '';
    const idStr = id?.toString() || '';
    const statusStr = status?.toString() || '';
    try {
        let response;
        switch (action?.toString()) {
            case 'getNumber':
                response = await buynumber({ api_key: apiKeyStr, service: serviceStr, country: countryStr });
                break;
            case 'getStatus':
                response = await getsms({ api_key: apiKeyStr, id: idStr });
                break;
            case 'setStatus':
                response = await setcancel({ api_key: apiKeyStr, id: idStr, status: statusStr });
                break;
            case 'regetNumber':
                response = await regetnumber({ api_key: apiKeyStr, id: idStr });
                break;
            default:
                response = 'WRONG_ACTION';
        }
        // Send plain text response (PHP compatible)
        res.set('Content-Type', 'text/plain');
        res.send(response);
    }
    catch (error) {
        console.error('[Stubs API] Error:', error);
        res.set('Content-Type', 'text/plain');
        res.send('NO_ACTION');
    }
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Start server
app.listen(PORT, () => {
    console.log(`[Stubs API] Server running on port ${PORT}`);
    console.log(`[Stubs API] Database: ${process.env.DATABASE_URL}`);
});
