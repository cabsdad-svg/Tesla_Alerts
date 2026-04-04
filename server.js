/**
 * Tesla Alerts Backend - Node.js/Express + SQLite
 * 
 * A simple backend service for storing and retrieving crowd-sourced driving alerts.
 * Designed to work with the tesla_alerts_final.html frontend.
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = './tesla_alerts.db';

// Middleware
app.use(cors({
  origin: true, // Allow all origins - adjust for production security
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' })); // Limit JSON size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files (for testing frontend locally)
app.use(express.static(path.join(__dirname, '../')));

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
  
  // Create tables
  db.serialize(() => {
    // Main reports table
    db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        userId TEXT,
        accuracy INTEGER,
        speed REAL,
        heading INTEGER,
        address TEXT,
        confidence INTEGER DEFAULT 100
      )
    `);
    
    // Create indexes for better query performance
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_reports_lat_lng 
      ON reports(lat, lng)
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_reports_timestamp 
      ON reports(timestamp)
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_reports_type 
      ON reports(type)
    `);
    
    console.log('Database tables initialized.');
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'tesla-alerts-backend'
  });
});

// Get all reports (with optional bounding box filtering)
app.get('/api/reports', (req, res) => {
  const { minLat, minLng, maxLat, maxLng, limit, offset, type } = req.query;
  
  let query = 'SELECT * FROM reports WHERE 1=1';
  const params = [];
  
  // Add bounding box filter if provided
  if (minLat && minLng && maxLat && maxLng) {
    query += ' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?';
    params.push(parseFloat(minLat), parseFloat(maxLat), parseFloat(minLng), parseFloat(maxLng));
  }
  
  // Add type filter if provided
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }
  
  // Add ordering and pagination
  query += ' ORDER BY timestamp DESC';
  
  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
    
    if (offset) {
      query += ' OFFSET ?';
      params.push(parseInt(offset));
    }
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    // Convert DATABASE NULL to JSON null properly
    const reports = rows.map(row => ({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      type: row.type,
      timestamp: row.timestamp,
      userId: row.userId || null,
      accuracy: row.accuracy || null,
      speed: row.speed || null,
      heading: row.heading || null,
      address: row.address || null,
      confidence: row.confidence || 100
    }));
    
    res.json({
      count: reports.length,
      reports: reports,
      timestamp: new Date().toISOString()
    });
  });
});

// Get report by ID
app.get('/api/reports/:id', (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid report ID' });
  }
  
  db.get('SELECT * FROM reports WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      type: row.type,
      timestamp: row.timestamp,
      userId: row.userId || null,
      accuracy: row.accuracy || null,
      speed: row.speed || null,
      heading: row.heading || null,
      address: row.address || null,
      confidence: row.confidence || 100
    });
  });
});

// Create new report
app.post('/api/reports', (req, res) => {
  const { lat, lng, type, userId, accuracy, speed, heading, address, confidence } = req.body;
  
  // Validate required fields
  if (lat === undefined || lng === undefined || type === undefined) {
    return res.status(400).json({ 
      error: 'Missing required fields: lat, lng, and type are required' 
    });
  }
  
  // Validate data types and ranges
  if (typeof lat !== 'number' || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Latitude must be a number between -90 and 90' });
  }
  
  if (typeof lng !== 'number' || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Longitude must be a number between -180 and 180' });
  }
  
  // Validate alert type
  const validTypes = ['police', 'speedcamera', 'redlightcamera', 'hazard', 'accident', 'construction', 'blocked'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ 
      error: `Invalid alert type. Must be one of: ${validTypes.join(', ')}` 
    });
  }
  
  // Insert new report
  db.run(
    `INSERT INTO reports (lat, lng, type, userId, accuracy, speed, heading, address, confidence) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parseFloat(lat),
      parseFloat(lng),
      type,
      userId || null,
      accuracy !== undefined ? parseInt(accuracy) : null,
      speed !== undefined ? parseFloat(speed) : null,
      heading !== undefined ? parseInt(heading) : null,
      address || null,
      confidence !== undefined ? parseInt(confidence) : 100
    ],
    function(err) {
      if (err) {
        console.error('Database insert error:', err);
        return res.status(500).json({ error: 'Failed to save report' });
      }
      
      // Return the created report
      res.status(201).json({
        id: this.lastID,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        type: type,
        timestamp: new Date().toISOString(),
        userId: userId || null,
        accuracy: accuracy !== undefined ? parseInt(accuracy) : null,
        speed: speed !== undefined ? parseFloat(speed) : null,
        heading: heading !== undefined ? parseInt(heading) : null,
        address: address || null,
        confidence: confidence !== undefined ? parseInt(confidence) : 100
      });
    }
  );
});

// Delete report (for moderation/admin)
app.delete('/api/reports/:id', (req, res) => {
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid report ID' });
  }
  
  db.run('DELETE FROM reports WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database delete error:', err);
      return res.status(500).json({ error: 'Failed to delete report' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json({ 
      message: 'Report deleted successfully',
      deletedId: id
    });
  });
});

// Get statistics
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  db.all(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN DATE(timestamp) = ? THEN 1 ELSE 0 END) as today,
      type,
      COUNT(*) as type_count
    FROM reports 
    GROUP BY type
    UNION ALL
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN DATE(timestamp) = ? THEN 1 ELSE 0 END) as today,
      'ALL' as type,
      COUNT(*) as type_count
    FROM reports
  `, [today, today], (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    const stats = {
      totalReports: 0,
      todayReports: 0,
      byType: {}
    };
    
    rows.forEach(row => {
      if (row.type === 'ALL') {
        stats.totalReports = row.total;
        stats.todayReports = row.today;
      } else {
        stats.byType[row.type] = row.type_count;
      }
    });
    
    res.json({
      ...stats,
      timestamp: new Date().toISOString()
    });
  });
});

// Delete old reports (cleanup endpoint - call periodically)
app.delete('/api/reports/cleanup', (req, res) => {
  const { days } = req.query;
  const daysToKeep = parseInt(days) || 30; // Default to 30 days
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffISO = cutoffDate.toISOString().split('T')[0];
  
  db.run(
    'DELETE FROM reports WHERE DATE(timestamp) < ?',
    [cutoffISO],
    function(err) {
      if (err) {
        console.error('Database cleanup error:', err);
        return res.status(500).json({ error: 'Cleanup failed' });
      }
      
      res.json({
        message: `Cleanup completed. Deleted ${this.changes} reports older than ${daysToKeep} days.`,
        deletedCount: this.changes,
        cutoffDate: cutoffISO
      });
    }
  );
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚗 Tesla Alerts Backend Started
  📡 Server listening on http://0.0.0.0:${PORT}
  🏥 Health check: http://localhost:${PORT}/health
  📚 API docs: http://localhost:${PORT}/api/reports
  
  🔧 To connect frontend:
  1. Update tesla_alerts_final.html to use API endpoints
  2. Replace localStorage functions with fetch calls to this server
  
  📝 Example API usage:
  GET  http://localhost:${PORT}/api/reports          # Get all reports
  POST http://localhost:${PORT}/api/reports          # Create new report
  GET  http://localhost:${PORT}/api/reports/:id      # Get specific report
  DELETE http://localhost:${PORT}/api/reports/:id    # Delete report
  GET  http://localhost:${PORT}/api/stats            # Get statistics
  
  Press Ctrl+C to stop the server
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('🚪 Server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      }
      console.log('🗄️  Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM');
  process.emit('SIGINT');
});