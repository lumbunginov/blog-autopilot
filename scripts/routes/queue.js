'use strict';
const fs = require('fs');

module.exports = function registerQueue(app, deps) {
  const { QUEUE_FILE } = deps.paths;
  const { broadcast } = deps;

  function readQueue() {
    if (!fs.existsSync(QUEUE_FILE)) return { tasks: [] };
    try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); }
    catch (e) { console.error('Failed to parse queue file:', e.message); return { tasks: [] }; }
  }

  app.get('/api/agent-queue', (req, res) => res.json(readQueue()));

  app.post('/api/agent-queue', (req, res) => {
    const task = req.body || {};
    if (!task.type || !task.input) return res.status(400).json({ error: 'type and input are required' });
    const data = readQueue();
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
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
    broadcast('queue_updated', { id: task.id, status: task.status, progress: task.progress, input: task.input });
    res.json({ success: true, id: task.id });
  });

  app.patch('/api/agent-queue', (req, res) => {
    const update = req.body || {};
    if (!update.id) return res.status(400).json({ error: 'id is required' });
    const data = readQueue();
    const idx = data.tasks.findIndex(t => t.id === update.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    if (update.status !== undefined) data.tasks[idx].status = update.status;
    if (update.progress !== undefined) data.tasks[idx].progress = update.progress;
    if (update.results !== undefined) data.tasks[idx].results = update.results;
    if (update.error !== undefined) data.tasks[idx].error = update.error;
    data.tasks[idx].updated_at = new Date().toISOString();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
    broadcast('queue_updated', { id: update.id, status: data.tasks[idx].status, progress: data.tasks[idx].progress });
    res.json({ success: true });
  });
};
