'use strict';

module.exports = function registerEvents(app, deps) {
  const { sseClients } = deps.state;

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);
    res.on('error', () => sseClients.delete(res));
    req.on('close', () => sseClients.delete(res));
  });
};
