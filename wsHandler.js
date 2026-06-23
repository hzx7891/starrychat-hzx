const url = require('url');
const fs = require('fs');
const path = require('path');

const clients = new Map();
const rooms = new Set(['大厅']);
const MSG_DIR = path.join(__dirname, 'messages');
if (!fs.existsSync(MSG_DIR)) fs.mkdirSync(MSG_DIR);

function handleUpgrade(server) {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else { socket.destroy(); }
  });

  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 45000);

  wss.on('connection', (ws, req) => {
    const params = url.parse(req.url, true).query;
    const token = params.token;
    if (!token) { ws.close(); return; }
    const username = Buffer.from(token, 'base64').toString().split(':')[0];
    clients.set(ws, { username, room: '大厅' });
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    console.log('OK ' + username + ' connected');

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw);
        console.log('RECV from ' + username + ': ' + JSON.stringify(data));

        switch (data.action) {
          case 'join':
            if (rooms.has(data.room)) {
              const client = clients.get(ws);
              if (client) client.room = data.room;
              ws.send(JSON.stringify({ type: 'history', room: data.room, messages: readRoomHistory(data.room) }));
              broadcast({ type: 'system', content: username + ' joined ' + data.room, room: data.room }, ws);
              broadcastOnlineUsers();
            }
            break;
          case 'create_room':
            if (!rooms.has(data.room)) { rooms.add(data.room); broadcastRoomList(); }
            break;
          case 'message':
            const msgId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            const msgObj = { id: msgId, type: 'message', nickname: username, content: data.content, msgType: data.msgType || 'text', avatar: data.avatar || '', timestamp: new Date().toISOString() };
            const client = clients.get(ws);
            const currentRoom = client ? client.room : '大厅';
            appendToRoomFile(currentRoom, msgObj);
            broadcast({ ...msgObj, room: currentRoom });
            break;
          case 'recall':
            const recallRoom = clients.get(ws)?.room || '大厅';
            let history = readRoomHistory(recallRoom);
            history = history.filter(m => m.id !== data.msgId);
            fs.writeFileSync(roomFilePath(recallRoom), JSON.stringify(history));
            broadcast({ type: 'recall', room: recallRoom, msgId: data.msgId });
            break;
          case 'file':
            const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            const fileObj = { id: fileId, type: 'message', nickname: username, content: data.content, msgType: 'file', filename: data.filename, avatar: data.avatar || '', timestamp: new Date().toISOString() };
            const clientFile = clients.get(ws);
            const fileRoom = clientFile ? clientFile.room : '大厅';
            appendToRoomFile(fileRoom, fileObj);
            broadcast({ ...fileObj, room: fileRoom });
            break;
          case 'private_message':
            clients.forEach((client, wsIter) => {
              if (client.username === data.target && wsIter.readyState === 1) {
                wsIter.send(JSON.stringify({ type: 'private_message', nickname: username, content: data.content, msgType: 'text' }));
              }
            });
            break;
          case 'typing':
            broadcast({ type: 'typing', nickname: username }, ws);
            break;
          case 'video_offer':
          case 'video_answer':
          case 'video_candidate':
          case 'hangup':
            clients.forEach((client, wsIter) => {
              if (client.username === data.target && wsIter.readyState === 1) {
                wsIter.send(JSON.stringify({ ...data, nickname: username }));
              }
            });
            break;
        }
      } catch (err) {}
    });

    ws.on('close', () => {
      const client = clients.get(ws);
      if (client) {
        broadcast({ type: 'system', content: client.username + ' left the room', room: client.room });
        clients.delete(ws);
        broadcastOnlineUsers();
        console.log('CLOSE ' + client.username);
      }
    });
  });

  wss.on('close', () => clearInterval(interval));
}

function roomFilePath(room) { return path.join(MSG_DIR, room + '.json'); }
function readRoomHistory(room) {
  try { if (fs.existsSync(roomFilePath(room))) return JSON.parse(fs.readFileSync(roomFilePath(room), 'utf8')); } catch(e){}
  return [];
}
function appendToRoomFile(room, msg) {
  let history = readRoomHistory(room);
  history.push(msg);
  if (history.length > 500) history = history.slice(-500);
  fs.writeFileSync(roomFilePath(room), JSON.stringify(history));
}
function broadcast(msg, excludeWs) {
  clients.forEach((client, ws) => {
    if (ws !== excludeWs && ws.readyState === 1 && (!msg.room || client.room === msg.room)) {
      ws.send(JSON.stringify(msg));
    }
  });
}
function broadcastRoomList() {
  const list = Array.from(rooms);
  clients.forEach((_, ws) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'room_list', rooms: list }));
  });
}
function broadcastOnlineUsers() {
  const list = [];
  clients.forEach((client) => {
    if (client && client.ws && client.ws.readyState === 1) {
      list.push(client.username);
    }
  });
  broadcast({ type: 'member_list', members: list });
}

module.exports = { handleUpgrade, clients, broadcast, readRoomHistory, appendToRoomFile };
