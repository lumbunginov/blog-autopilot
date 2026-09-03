#!/usr/bin/env node
'use strict';
const path = require('path');
const express = require('express');

const { makePaths } = require('./lib/paths');
const { loadDotEnv } = require('./lib/env');

const PORT = 3847;
const SKILL_DIR = path.join(__dirname, '..');
loadDotEnv(path.join(SKILL_DIR, '.env'));

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const sseClients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(msg); } catch (e) { sseClients.delete(client); }
  });
}

const state = { syncState: { done: true, updated: 0, lastSync: null }, sseClients };
const paths = makePaths(SKILL_DIR);
const deps = { paths, state, broadcast };

require('./routes/events')(app, deps);
require('./routes/plans')(app, deps);
require('./routes/queue')(app, deps);
require('./routes/config')(app, deps);
require('./routes/articles')(app, deps);
require('./routes/scrape')(app, deps);
require('./routes/blogs')(app, deps);
require('./routes/knowledge-source')(app, deps);
require('./routes/templates')(app, deps);

app.use(express.static(path.join(SKILL_DIR, 'public')));

const server = app.listen(PORT, () => {
  const dashboardUrl = `http://localhost:${PORT}`;
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║        Blog Autopilot Dashboard        ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`🌐 Dashboard: ${dashboardUrl}`);
  console.log(`📁 Data     : ${paths.blogsDir()}`);
  console.log('\nPress Ctrl+C to stop\n');
  const { exec } = require('child_process');
  const openCmd = process.platform === 'win32' ? `start ${dashboardUrl}`
    : process.platform === 'darwin' ? `open ${dashboardUrl}` : `xdg-open ${dashboardUrl}`;
  exec(openCmd);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} already in use.`);
    console.error(`Try: http://localhost:${PORT} — it may already be running.\n`);
  } else console.error(e);
  process.exit(1);
});

process.on('SIGINT', () => { console.log('\n\nDashboard stopped.'); process.exit(0); });
