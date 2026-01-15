/**
 * Test server that mimics production cache behavior.
 * Serves static files with Cache-Control headers like Cloudflare.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const SITE_DIR = path.join(__dirname, '..', '..', '_site');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  // Handle directory requests
  if (urlPath.endsWith('/')) {
    urlPath += 'index.html';
  }

  // Handle requests without extension (try .html)
  const filePath = path.join(SITE_DIR, urlPath);
  let finalPath = filePath;

  if (!fs.existsSync(finalPath)) {
    // Try with .html extension
    if (fs.existsSync(filePath + '.html')) {
      finalPath = filePath + '.html';
    }
    // Try as directory with index.html
    else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      // Redirect to add trailing slash
      res.writeHead(301, { Location: urlPath + '/' });
      res.end();
      return;
    }
  }

  fs.readFile(finalPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(finalPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Add Cache-Control header like production (Cloudflare)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'max-age=86400',
      'Vary': 'Accept-Encoding',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  console.log(`Serving files from ${SITE_DIR}`);
});
