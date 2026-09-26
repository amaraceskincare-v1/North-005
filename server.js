const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const REPORTS_DIR = path.join(__dirname, 'generated_reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const INDEX_FILE = path.join(REPORTS_DIR, 'index.json');
if (!fs.existsSync(INDEX_FILE)) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), 'utf8');
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function readReportsIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading reports index:', e);
  }
  return [];
}

function writeReportsIndex(indexData) {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing reports index:', e);
  }
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;

  // -------------------------------------------------------------
  // API ROUTING: /api/reports
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. GET /api/reports - list stored reports
    if (pathname === '/api/reports' && req.method === 'GET') {
      const index = readReportsIndex();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(index));
      return;
    }

    // 2. GET /api/reports/check?dateKey=...&type=...
    if (pathname === '/api/reports/check' && req.method === 'GET') {
      const dateKey = parsedUrl.searchParams.get('dateKey');
      const type = (parsedUrl.searchParams.get('type') || 'ddn').toLowerCase();
      
      let exists = false;
      if (dateKey) {
        const dateDir = path.join(REPORTS_DIR, dateKey);
        const metaPath = path.join(dateDir, 'meta.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const filename = type === 'samal' ? meta.samalFileName : meta.ddnFileName;
            if (filename && fs.existsSync(path.join(dateDir, filename))) {
              exists = true;
            }
          } catch (e) {}
        }
        // Fallback check in templates directory
        if (!exists) {
          const tplFiles = fs.readdirSync(path.join(__dirname, 'templates')).filter(f => f.endsWith('.xlsx'));
          const target = tplFiles.find(f => {
            const upper = f.toUpperCase();
            return type === 'samal' ? upper.includes('SAMAL') : upper.includes('DDN');
          });
          if (target) exists = true;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ exists }));
      return;
    }

    // 3. GET /api/reports/download?dateKey=...&type=...
    if (pathname === '/api/reports/download' && req.method === 'GET') {
      const dateKey = parsedUrl.searchParams.get('dateKey');
      const type = (parsedUrl.searchParams.get('type') || 'ddn').toLowerCase();

      if (!dateKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing dateKey parameter.');
        return;
      }

      const dateDir = path.join(REPORTS_DIR, dateKey);
      let targetFile = null;
      let downloadFilename = null;

      // Look in generated_reports/<dateKey>/
      if (fs.existsSync(dateDir)) {
        const metaPath = path.join(dateDir, 'meta.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            downloadFilename = type === 'samal' ? meta.samalFileName : meta.ddnFileName;
            const fullPath = path.join(dateDir, downloadFilename);
            if (fs.existsSync(fullPath)) {
              targetFile = fullPath;
            }
          } catch (e) {}
        }

        // If meta lookup didn't find file, search files in directory
        if (!targetFile) {
          const files = fs.readdirSync(dateDir);
          const match = files.find(f => {
            const upper = f.toUpperCase();
            return (type === 'samal' ? upper.includes('SAMAL') : upper.includes('DDN')) && upper.endsWith('.XLSX');
          });
          if (match) {
            targetFile = path.join(dateDir, match);
            downloadFilename = match;
          }
        }
      }

      // Fallback: check templates directory for pre-existing templates (e.g. September 3)
      if (!targetFile) {
        const tplDir = path.join(__dirname, 'templates');
        if (fs.existsSync(tplDir)) {
          const tplFiles = fs.readdirSync(tplDir);
          const match = tplFiles.find(f => {
            const upper = f.toUpperCase();
            return (type === 'samal' ? upper.includes('SAMAL') : upper.includes('DDN')) && upper.endsWith('.XLSX') && upper.includes('COMPLETED');
          });
          if (match) {
            targetFile = path.join(tplDir, match);
            downloadFilename = match;
          }
        }
      }

      if (!targetFile || !fs.existsSync(targetFile)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Report file not found for ${dateKey} (${type.toUpperCase()}).`);
        return;
      }

      // Ensure proper human-readable filename format: [PREFIX] - [DATE] - COMPLETED.xlsx
      if (!downloadFilename) {
        downloadFilename = path.basename(targetFile);
      }

      try {
        const stat = fs.statSync(targetFile);
        const fileContent = fs.readFileSync(targetFile);

        // Strict Content-Disposition header with exact quoted filename
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${downloadFilename}"`,
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(fileContent);
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading report file: ' + err.message);
        return;
      }
    }

    // 4. POST /api/reports - Save generated report files & metadata
    if (pathname === '/api/reports' && req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const data = JSON.parse(raw);
          const { dateKey, dateFormatted, sourceFile, recordsCount, ddnFileName, samalFileName, ddnBase64, samalBase64, metrics, timestamp } = data;

          if (!dateKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing dateKey' }));
            return;
          }

          const dateDir = path.join(REPORTS_DIR, dateKey);
          if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
          }

          // Write DDN Excel file
          if (ddnBase64 && ddnFileName) {
            const ddnPath = path.join(dateDir, ddnFileName);
            fs.writeFileSync(ddnPath, Buffer.from(ddnBase64, 'base64'));
          }

          // Write SAMAL Excel file
          if (samalBase64 && samalFileName) {
            const samalPath = path.join(dateDir, samalFileName);
            fs.writeFileSync(samalPath, Buffer.from(samalBase64, 'base64'));
          }

          // Write metadata
          const meta = {
            dateKey,
            dateFormatted: dateFormatted || dateKey,
            sourceFile: sourceFile || 'Uploaded file',
            recordsCount: recordsCount || 0,
            ddnFileName,
            samalFileName,
            metrics: metrics || null,
            timestamp: timestamp || new Date().toISOString()
          };
          fs.writeFileSync(path.join(dateDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

          // Update index
          let index = readReportsIndex();
          index = index.filter(item => item.dateKey !== dateKey);
          index.push(meta);
          index.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
          writeReportsIndex(index);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, dateKey }));
        } catch (err) {
          console.error('Failed to save report:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 5. DELETE /api/reports?dateKey=... - Delete report record and associated generated files
    if (pathname === '/api/reports' && req.method === 'DELETE') {
      const dateKey = parsedUrl.searchParams.get('dateKey');
      if (!dateKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing dateKey parameter.' }));
        return;
      }

      try {
        const dateDir = path.join(REPORTS_DIR, dateKey);
        if (fs.existsSync(dateDir)) {
          fs.rmSync(dateDir, { recursive: true, force: true });
        }

        // Remove from index
        let index = readReportsIndex();
        index = index.filter(item => item.dateKey !== dateKey);
        writeReportsIndex(index);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Report deleted successfully.' }));
      } catch (err) {
        console.error('Failed to delete report:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  // -------------------------------------------------------------
  // STATIC ASSETS & SPA ROUTING
  // -------------------------------------------------------------
  const urlPath = pathname;
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  let ext = path.extname(filePath).toLowerCase();

  // If request has no extension (e.g. /sales-collection, /master-registry, /dashboard),
  // it is an SPA route! Serve index.html directly with 200 OK.
  if (!ext) {
    filePath = path.join(__dirname, 'index.html');
    ext = '.html';
  }

  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for SPA routes
        if (!urlPath.startsWith('/css/') && !urlPath.startsWith('/js/') && !urlPath.startsWith('/assets/')) {
          fs.readFile(path.join(__dirname, 'index.html'), (indexErr, indexContent) => {
            if (indexErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Server Error: ' + indexErr.code);
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexContent, 'utf-8');
            }
          });
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
});
