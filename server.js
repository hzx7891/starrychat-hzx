const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');
const { handleUpgrade, clients, broadcast, readRoomHistory } = require('./wsHandler');
const { init } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', routes);

// ====== API Key 管理 ======
const API_KEYS_FILE = path.join(__dirname, 'api_keys.json');
if (!fs.existsSync(API_KEYS_FILE)) fs.writeFileSync(API_KEYS_FILE, '{}');

app.get('/api/docs', (req, res) => {
  const file = path.join(__dirname, 'public', 'apigrand.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.send('API 平台页面尚未创建。');
});

app.get('/api', (req, res) => {
  res.json({ message: '星迹 API 已就绪，请访问 /api/docs 查看文档。' });
});

app.post('/api/apiregister', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: '邮箱和密码不能为空' });
    const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    if (keys[email]) return res.json({ success: false, message: '该邮箱已注册' });
    const apiKey = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
    const now = new Date();
    const julyFirst = new Date(now.getFullYear(), 6, 1);
    const dailyLimit = now < julyFirst ? 20 : 10;
    keys[email] = { password, apiKey, usage: 0, sendUsage: 0, date: now.toDateString(), dailyLimit, registeredAt: now.toISOString() };
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    res.json({ success: true, apiKey, dailyLimit, message: '注册成功！' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/apilogin', (req, res) => {
  try {
    const { email, password } = req.body;
    const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    if (!keys[email] || keys[email].password !== password) return res.json({ success: false, message: '邮箱或密码错误' });
    res.json({ success: true, apiKey: keys[email].apiKey });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/call', (req, res) => {
  try {
    const apiKey = req.body.apiKey;
    if (!apiKey) return res.status(401).json({ error: 'Missing API key' });
    const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    const userEntry = Object.entries(keys).find(([_, v]) => v.apiKey === apiKey);
    if (!userEntry) return res.status(401).json({ error: 'Invalid API key' });
    const [email, data] = userEntry;
    const today = new Date().toDateString();
    if (data.date !== today) { data.usage = 0; data.sendUsage = 0; data.date = today; }
    if (data.usage >= data.dailyLimit) return res.status(429).json({ error: 'Daily call limit exceeded' });
    data.usage++;
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    const online = [];
    clients.forEach(client => online.push(client.username));
    res.json({ online, message: 'Hello from StarryChat API', yourUsage: data.usage, dailyLimit: data.dailyLimit });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/send', (req, res) => {
  try {
    const { apiKey, message } = req.body;
    if (!apiKey || !message) return res.status(400).json({ error: 'Missing apiKey or message' });
    const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    const userEntry = Object.entries(keys).find(([_, v]) => v.apiKey === apiKey);
    if (!userEntry) return res.status(401).json({ error: 'Invalid API key' });
    const [email, data] = userEntry;
    const today = new Date().toDateString();
    if (data.date !== today) { data.usage = 0; data.sendUsage = 0; data.date = today; }
    if (data.sendUsage >= 50) return res.status(429).json({ error: 'Send limit exceeded (50/day)' });
    data.sendUsage++;
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    broadcast({ type: 'system', content: '[API] ' + email + ': ' + message, room: '大厅' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/history', (req, res) => {
  try {
    const { apiKey, room } = req.body;
    if (!apiKey) return res.status(401).json({ error: 'Missing API key' });
    const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    const userEntry = Object.entries(keys).find(([_, v]) => v.apiKey === apiKey);
    if (!userEntry) return res.status(401).json({ error: 'Invalid API key' });
    const roomName = room || '大厅';
    const messages = readRoomHistory(roomName);
    res.json({ room: roomName, messages: messages.slice(-50) });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/resetkey', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'Missing apiKey' });
    const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8'));
    const userEntry = Object.entries(keys).find(([_, v]) => v.apiKey === apiKey);
    if (!userEntry) return res.status(401).json({ error: 'Invalid API key' });
    const [email, data] = userEntry;
    const newApiKey = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
    data.apiKey = newApiKey;
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    res.json({ success: true, newApiKey });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

const server = http.createServer(app);
handleUpgrade(server);

init().then(() => {
  const PORT = process.env.PORT || 8000;
  server.listen(PORT, '::', () => {
    console.log('星迹聊天室已启动！');
    console.log('本地访问：http://127.0.0.1:8000');
    console.log('IPv6访问：http://[你的IPv6地址]:8000');
    console.log('API 平台：http://127.0.0.1:8000/api/docs');
  });
}).catch(err => { console.error('数据库初始化失败', err); });
