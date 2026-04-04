# Tesla Alerts Backend

A Node.js/Express backend service for the Tesla crowd-sourced driving alerts system.

## Features

- RESTful API for alert management
- SQLite database with proper indexing
- CORS enabled for frontend integration
- Health check endpoint
- Automatic cleanup of old reports
- Statistics endpoint
- Docker-ready configuration

## API Endpoints

### Health Check
```
GET /health
```
Returns service status.

### Reports
```
GET /api/reports
```
Get all reports with optional filtering:
- `minLat`, `minLng`, `maxLat`, `maxLng` - bounding box filter
- `type` - filter by alert type
- `limit`, `offset` - pagination

```
GET /api/reports/:id
```
Get a specific report by ID.

```
POST /api/reports
```
Create a new report:
```json
{
  "lat": 37.7749,
  "lng": -122.4194,
  "type": "police",
  "userId": "tesla-user-123",
  "accuracy": 5,
  "speed": 65,
  "heading": 180,
  "address": "San Francisco, CA",
  "confidence": 95
}
```

Required fields: `lat`, `lng`, `type`

```
DELETE /api/reports/:id
```
Delete a report (moderation/admin).

### Statistics
```
GET /api/stats
```
Get usage statistics including total reports, today's reports, and breakdown by type.

### Cleanup
```
DELETE /api/reports/cleanup?days=30
```
Delete reports older than specified days (default: 30).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

3. The server will start on port 3000 by default (or use `PORT` environment variable).

## Database

The backend uses SQLite with automatic table creation on startup. The database file is stored at `./tesla_alerts.db` relative to the server directory.

Tables created:
- `reports` - Main alert reports table with indexes for performance

## Docker Support

Build and run with Docker:
```bash
docker build -t tesla-alerts-backend .
docker run -p 3000:3000 tesla-alerts-backend
```

Or use docker-compose:
```yaml
version: '3.8'
services:
  tesla-alerts-backend:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
```

## Connecting to Frontend

To connect your Tesla alerts frontend (tesla_alerts_final.html) to this backend:

1. Replace the `loadReports()` function with:
   ```javascript
   async function loadReports() {
     try {
       const response = await fetch('/api/reports');
       if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
       const data = await response.json();
       return data.reports || [];
     } catch (error) {
       console.error('Failed to load reports:', error);
       return []; // Return empty array on failure
     }
   }
   ```

2. Replace the `saveReports()` function with:
   ```javascript
   async function saveReport(reportData) {
     try {
       const response = await fetch('/api/reports', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(reportData),
       });
       
       if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
       return await response.json();
     } catch (error) {
       console.error('Failed to save report:', error);
       throw error; // Re-throw to handle in UI
     }
   }
   ```

3. Replace the report deletion logic with:
   ```javascript
   async function deleteReport(reportId) {
     try {
       const response = await fetch(`/api/reports/${reportId}`, {
         method: 'DELETE'
       });
       
       if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
       return await response.json();
     } catch (error) {
       console.error('Failed to delete report:', error);
       throw error;
     }
   }
   ```

4. Update the base URL to point to your deployed backend:
   ```javascript
   const API_BASE_URL = 'https://your-backend-domain.com'; // or http://localhost:3000 for local
   ```

## Environment Variables

- `PORT` - Port to run the server on (default: 3000)
- `NODE_ENV` - Environment (development, production)

## Performance Notes

- Database indexes are created on `lat,lng`, `timestamp`, and `type` for efficient querying
- Consider adding more indexes based on your query patterns
- For high-volume usage, consider migrating to PostgreSQL with PostGIS extension
- Implement rate blocking if needed to prevent abuse

## Security Considerations

1. **CORS**: Currently set to allow all origins. For production, restrict to your frontend domain(s).
2. **Input Validation**: All inputs are validated and sanitized.
3. **Rate Limiting**: Consider adding express-rate-limit or similar for production.
4. **HTTPS**: Always use HTTPS in production (Tesla requires secure contexts for geolocation).
5. **Database Backups**: Regularly backup your SQLite database file.

## Troubleshooting

### Database Connection Issues
- Check file permissions on the directory containing the SQLite database
- Ensure the directory is writable by the Node.js process

### Performance Problems
- Monitor query performance with SQLite's EXPLAIN QUERY PLAN
- Consider adding additional indexes based on your usage patterns
- For very high traffic, evaluate migrating to PostgreSQL

### CORS Errors
- Verify the CORS middleware is properly configured
- Check that your frontend is making requests to the correct origin
- Ensure your backend is sending the proper Access-Control-Allow-Origin headers

## License

MIT License - feel free to use, modify, and distribute.