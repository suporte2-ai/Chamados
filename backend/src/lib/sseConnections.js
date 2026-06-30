// backend/src/lib/sseConnections.js
// Map<userId:number, Set<res>> — guarda as conexões SSE ativas por usuário
const connections = new Map();

function add(userId, res) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(res);
}

function remove(userId, res) {
  connections.get(userId)?.delete(res);
  if (connections.get(userId)?.size === 0) connections.delete(userId);
}

function push(userId, event, data) {
  const conns = connections.get(userId);
  if (!conns) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch (_) { conns.delete(res); }
  }
}

module.exports = { add, remove, push };
