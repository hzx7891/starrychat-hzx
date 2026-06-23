const express = require('express');
const router = express.Router();
const { get, run } = require('./db');

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  try {
    run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: '用户名已存在' });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const row = get('SELECT * FROM users WHERE username=? AND password=?', [username, password]);
  if (row) {
    const token = Buffer.from(username + ':' + Date.now()).toString('base64');
    res.json({ success: true, token, username });
  } else {
    res.json({ success: false, message: '账号或密码错误' });
  }
});

module.exports = router;
