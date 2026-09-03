'use strict';
const fs = require('fs');
const { resolveBlog, requireBlog } = require('../lib/tenant');

module.exports = function registerQueue(app, deps) {
  const { paths, broadcast } = deps;

  function readQueue(queueFile) {
    if (!fs.existsSync(queueFile)) return { tasks: [] };
    try { return JSON.parse(fs.readFileSync(queueFile, 'utf-8')); }
    catch (e) { console.error('Failed to parse queue file:', e.message); return { tasks: [] }; }
  }

  app.get('/api/agent-queue', (req, res) => {
    try { res.json(readQueue(paths.queuePath(resolveBlog(req, paths)))); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  app.post('/api/agent-queue', (req, res) => {
    let queueFile;
    try { queueFile = paths.queuePath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const task = req.body || {};
    if (!task.type || !task.input) return res.status(400).json({ error: 'type and input are required' });
    const data = readQueue(queueFile);
    const now = new Date().toISOString();
    task.id = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    task.status = 'pending';
    task.progress = task.type === 'auto_generate'
      ? { current: 0, total: task.input.count || 5 }
      : (task.progress || { current: 0, total: 0 });
    task.results = [];
    task.error = null;
    task.created_at = now;
    task.updated_at = now;
    data.tasks.unshift(task);
    fs.writeFileSync(queueFile, JSON.stringify(data, null, 2));
    broadcast('queue_updated', { id: task.id, status: task.status, progress: task.progress, input: task.input });
    res.json({ success: true, id: task.id });
  });

  app.patch('/api/agent-queue', (req, res) => {
    let queueFile;
    try { queueFile = paths.queuePath(requireBlog(req, paths)); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const update = req.body || {};
    if (!update.id) return res.status(400).json({ error: 'id is required' });
    const data = readQueue(queueFile);
    const idx = data.tasks.findIndex(t => t.id === update.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    if (update.status !== undefined) data.tasks[idx].status = update.status;
    if (update.progress !== undefined) data.tasks[idx].progress = update.progress;
    if (update.results !== undefined) data.tasks[idx].results = update.results;
    if (update.error !== undefined) data.tasks[idx].error = update.error;
    data.tasks[idx].updated_at = new Date().toISOString();
    fs.writeFileSync(queueFile, JSON.stringify(data, null, 2));
    broadcast('queue_updated', { id: update.id, status: data.tasks[idx].status, progress: data.tasks[idx].progress });
    res.json({ success: true });
  });
};
