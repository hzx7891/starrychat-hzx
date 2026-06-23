// ============================================
// 星迹 StarryChat - 终极可视化修复版
// ============================================

// 1. 立即注入强制样式，确保消息容器绝对可见
(function() {
  const style = document.createElement('style');
  style.textContent = `
    #chatApp { display: block !important; height: 100vh !important; }
    .main { display: flex !important; flex-direction: column !important; flex: 1 !important; }
    #chatMessages {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 !important;
      overflow-y: auto !important;
      min-height: 300px !important;
      background: #1e1e1e !important;
      padding: 15px !important;
    }
    .msg {
      display: flex !important;
      align-items: flex-start !important;
      gap: 8px !important;
      margin-bottom: 8px !important;
      padding: 10px 14px !important;
      border-radius: 12px !important;
      max-width: 70% !important;
      word-break: break-word !important;
      position: relative !important;
      z-index: 1 !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .msg.self {
      align-self: flex-end !important;
      background: #95ec69 !important;
      color: #000 !important;
    }
    .msg.other {
      align-self: flex-start !important;
      background: #333 !important;
      color: #ccc !important;
    }
    .avatar {
      width: 32px !important;
      height: 32px !important;
      border-radius: 50% !important;
      object-fit: cover !important;
      flex-shrink: 0 !important;
    }
    .msg-content {
      flex: 1 !important;
    }
  `;
  document.head.appendChild(style);
})();

// ============================================
// 全局变量
// ============================================
let ws = null;
let token = "";
let currentUser = {};
let currentRoom = "大厅";
let myCache = {};

// ============================================
// 界面切换
// ============================================
function showRegister() {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("regBox").style.display = "block";
}
function showLogin() {
  document.getElementById("regBox").style.display = "none";
  document.getElementById("loginBox").style.display = "block";
}

// ============================================
// 登录
// ============================================
async function login() {
  const u = document.getElementById("loginUser").value.trim();
  const p = document.getElementById("loginPassword").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p })
  });
  const d = await res.json();
  if (d.success) {
    token = d.token;
    currentUser = { username: u, avatar: d.avatar || "" };
    document.getElementById("authPage").style.display = "none";
    document.getElementById("chatApp").style.display = "block";
    updateAvatarDisplay();
    connectWebSocket();
  } else {
    document.getElementById("loginError").innerText = d.message;
  }
}

// ============================================
// 注册
// ============================================
async function register() {
  const u = document.getElementById("regUsername").value.trim();
  const p = document.getElementById("regPassword").value;
  const sid = document.getElementById("regStudentId").value.trim();
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p, student_id: sid })
  });
  const d = await res.json();
  if (d.success) {
    alert("注册成功，请登录");
    showLogin();
  } else {
    document.getElementById("regError").innerText = d.message;
  }
}

// ============================================
// 退出
// ============================================
function logout() {
  if (ws) ws.close();
  token = "";
  currentUser = {};
  document.getElementById("authPage").style.display = "flex";
  document.getElementById("chatApp").style.display = "none";
}

// ============================================
// WebSocket 连接
// ============================================
function connectWebSocket() {
  if (ws) ws.close();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ action: "join", room: "大厅", nickname: currentUser.username }));
    currentRoom = "大厅";
    updateRoomList(["大厅"]);
  };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "history") {
      myCache[data.room] = data.messages;
      if (data.room === currentRoom) renderMessages();
    } else if (data.type === "room_list") {
      updateRoomList(data.rooms);
    } else if (data.type === "member_list") {
      renderMembers(data.members);
    } else if (data.type === "message") {
      const msg = {
        nickname: data.nickname,
        content: data.content,
        type: data.type || 'text',
        avatar: data.avatar || '',
        filename: data.filename
      };
      if (!myCache[data.room]) myCache[data.room] = [];
      myCache[data.room].push(msg);
      if (data.room === currentRoom) {
        appendMessage(msg, msg.nickname === currentUser.username);
      }
    }
  };
  ws.onclose = () => { setTimeout(connectWebSocket, 3000); };
  ws.onerror = () => {};
}

// ============================================
// 房间列表
// ============================================
function updateRoomList(rooms) {
  const list = document.getElementById("roomList");
  if (!list) return;
  list.innerHTML = "";
  rooms.forEach(room => {
    const div = document.createElement("div");
    div.className = "room-item" + (room === currentRoom ? " active" : "");
    div.textContent = room;
    div.onclick = () => { if (room !== currentRoom) joinRoom(room); };
    list.appendChild(div);
  });
}

function joinRoom(room) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ action: "join", room, nickname: currentUser.username }));
  currentRoom = room;
  document.getElementById("chatHeader").innerText = room === "大厅" ? "🏠 大厅" : "🔒 " + room;
  renderMessages();
}

// ============================================
// 创建房间弹窗
// ============================================
function showCreateRoom() { document.getElementById("createRoomModal").style.display = "flex"; }
function createRoom() {
  const name = document.getElementById("roomNameInput").value.trim();
  const pwd = document.getElementById("roomPwdInput").value.trim() || null;
  if (!name) return alert("房间名不能为空");
  ws.send(JSON.stringify({ action: "create_room", room: name, password: pwd, nickname: currentUser.username }));
  document.getElementById("createRoomModal").style.display = "none";
  document.getElementById("roomNameInput").value = "";
  document.getElementById("roomPwdInput").value = "";
}

// ============================================
// 渲染消息列表
// ============================================
function renderMessages() {
  const box = document.getElementById("chatMessages");
  box.innerHTML = "";
  const msgs = myCache[currentRoom] || [];
  msgs.forEach(m => appendMessage(m, m.nickname === currentUser.username));
  void box.offsetHeight; // 强制重绘
}

// ============================================
// 追加单条消息（修复版：强制可见 + 重绘）
// ============================================
function appendMessage(msg, isSelf) {
  const div = document.createElement("div");
  // 直接使用行内样式，绕过所有外部CSS
  div.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    max-width: 70%;
    word-break: break-word;
    background: ${isSelf ? '#95ec69' : '#333'};
    color: ${isSelf ? '#000' : '#ccc'};
    align-self: ${isSelf ? 'flex-end' : 'flex-start'};
    visibility: visible;
    opacity: 1;
  `;

  const avatarHtml = `<img class="avatar" src="${msg.avatar || getDefaultAvatar(msg.nickname || currentUser.username)}" />`;
  let contentHtml = "";
  if (!isSelf) contentHtml += `<div style="font-size:0.8rem;color:#aaa;">${msg.nickname || '匿名'}</div>`;

  if (msg.type === "image") {
    contentHtml += `<img src="${msg.content}" style="max-width:200px;border-radius:8px;margin-top:5px;" />`;
  } else if (msg.type === "video") {
    contentHtml += `<video src="${msg.content}" controls width="200" style="border-radius:8px;margin-top:5px;"></video>`;
  } else if (msg.type === "file") {
    const btn = document.createElement('button');
    btn.textContent = '📎 下载 ' + (msg.filename || '文件');
    btn.style.cssText = 'background:none;border:none;color:#4ec9b0;cursor:pointer;text-decoration:underline;padding:0;font:inherit;';
    btn.onclick = () => {
      try {
        const byteString = atob(msg.content.split(',')[1]);
        const mimeType = msg.content.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = msg.filename || 'download'; a.click(); URL.revokeObjectURL(url);
      } catch (err) { alert('下载失败，请重试'); }
    };
    div.innerHTML = avatarHtml + '<div class="msg-content">' + (isSelf ? '' : '<div style="font-size:0.8rem;color:#aaa;">' + msg.nickname + '</div>') + '</div>';
    div.querySelector('.msg-content').appendChild(btn);
    document.getElementById("chatMessages").appendChild(div);
    void div.offsetHeight; // 强制重绘
    return;
  } else {
    const text = String(msg.content).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    contentHtml += text;
  }

  div.innerHTML = avatarHtml + '<div class="msg-content">' + contentHtml + '</div>';
  document.getElementById("chatMessages").appendChild(div);
  void div.offsetHeight; // 强制重绘
}

// ============================================
// 默认头像
// ============================================
function getDefaultAvatar(nick) {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%234ec9b0'/%3E%3Ctext x='50' y='70' font-size='50' text-anchor='middle' fill='white'%3E" + (nick?.[0] || "?") + "%3C/text%3E%3C/svg%3E";
}

// ============================================
// 成员列表
// ============================================
function renderMembers(members) {
  document.getElementById("memberList").innerHTML = members.map(m => `<span>👤 ${m}</span>`).join(" · ");
}

// ============================================
// 发送消息
// ============================================
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    action: "message",
    room: currentRoom,
    nickname: currentUser.username,
    content: text,
    msgType: "text",
    avatar: currentUser.avatar || getDefaultAvatar(currentUser.username)
  }));
  input.value = "";
}

// ============================================
// 文件上传
// ============================================
document.getElementById("fileInput").addEventListener("change", (e) => {
  for (const file of e.target.files) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      const type = file.type.startsWith("image/") ? "image" : (file.type.startsWith("video/") ? "video" : "file");
      ws.send(JSON.stringify({
        action: "file",
        room: currentRoom,
        nickname: currentUser.username,
        content: base64,
        fileType: type,
        filename: file.name,
        avatar: currentUser.avatar
      }));
    };
    reader.readAsDataURL(file);
  }
  e.target.value = "";
});

// ============================================
// 回车发送
// ============================================
document.getElementById("messageInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// ============================================
// 头像更新
// ============================================
function updateAvatarDisplay() {
  const img = document.getElementById("myAvatarImg");
  if (currentUser.avatar) img.src = currentUser.avatar;
  else img.src = getDefaultAvatar(currentUser.username);
  img.onclick = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => { currentUser.avatar = ev.target.result; updateAvatarDisplay(); };
      reader.readAsDataURL(file);
    };
    input.click();
  };
}

// ============================================
// 踢人
// ============================================
document.getElementById("memberList").addEventListener("dblclick", (e) => {
  const target = e.target.textContent.trim().replace("👤 ", "");
  if (target && target !== currentUser.username) {
    if (confirm(`以房主身份踢出 ${target}？`)) {
      ws.send(JSON.stringify({ action: "kick", room: currentRoom, target_nickname: target }));
    }
  }
});