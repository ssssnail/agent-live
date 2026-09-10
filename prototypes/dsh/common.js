const officeUrl = "office-preview.html";

function officeFrame(label = "Agent Live office") {
  return `<iframe class="office-frame" title="${label}" src="${officeUrl}"></iframe>`;
}

function baseShell({ activeTab = "Chat", office = false, skin = false } = {}) {
  const body = office
    ? `<div class="tabs"><span class="tab">Chat</span><span class="tab">Trajectory</span><span class="tab active">Agent Live</span></div><div class="office-panel">${officeFrame("Agent Live session view")}</div>`
    : `<div class="tabs"><span class="tab ${activeTab === "Chat" ? "active" : ""}">Chat</span><span class="tab">Trajectory</span>${activeTab === "Agent Live" ? '<span class="tab active">Agent Live</span>' : ''}</div>
      <div class="messages">
        <div class="message user">Review the adapter boundary and keep the runtime lightweight.</div>
        <div class="message">I’ll inspect the public Session and Agent contracts first, then map only stable events.</div>
        <div class="tool-row"><span></span> Read packages/core/session · completed</div>
        <div class="message">The observer path is viable. No polling or second agent loop is required.</div>
      </div>
      <div class="composer">Ask DeepSeek Harness anything…<div class="composer-tools"><span>Standard · DeepSeek V4</span><strong>Send ↵</strong></div></div>`;

  return `<main class="dsh-shell ${skin ? "pixel-skin" : ""}">
    <header class="topbar"><div class="brand"><span class="brand-mark">◆</span>DeepSeek Harness</div><span class="top-path">agent-live / adapter review</span><div class="top-actions"><button class="soft-button">Standard</button><button class="icon-button">•••</button></div></header>
    <aside class="sidebar"><div class="side-section"><div class="side-title">WORKSPACES</div><div class="side-item active"><span class="dot"></span><span>agent-live</span></div><div class="side-item"><span class="dot" style="background:#718293"></span><span>deepseek-harness</span></div></div><div class="side-section"><div class="side-title">SESSIONS</div><div class="side-item active"><span>⌁</span><span>Adapter review</span></div><div class="side-item"><span>⌁</span><span>Renderer cleanup</span></div></div><div class="side-spacer"></div><div class="agent-live-entry"><span class="pixel-glyph"></span><span>Agent Live</span></div></aside>
    <section class="conversation"><div class="session-head"><strong>Adapter review</strong><span class="status">● Agent working</span></div>${body}</section>
    <aside class="details"><h3>Task details</h3><div class="detail-block"><div class="detail-label">Current tool</div><strong>Read</strong><br>packages/core/session</div><div class="detail-block"><div class="detail-label">Context</div>Workspace: agent-live<br>Session: 01J…82A</div></aside>
  </main>`;
}

const target = document.querySelector("[data-prototype]");
if (target) {
  const mode = target.dataset.prototype;
  if (mode === "standalone") {
    target.innerHTML = `<section class="standalone-wrap"><aside class="standalone-note"><h1>Agent Live runs beside DSH</h1><p>DeepSeek Harness remains the place where the user works. The Cordis plugin observes sessions and opens this local viewer.</p><div class="flow-step">Start in DSH<br>Open local Office URL<br>Return to the original task</div></aside>${officeFrame("Standalone Agent Live viewer")}</section>`;
  } else if (mode === "session-view") {
    target.innerHTML = baseShell({ office: true });
  } else if (mode === "overlay") {
    target.innerHTML = `${baseShell()}<div class="overlay-scrim"></div><section class="overlay-office"><div class="overlay-title"><span class="pixel-glyph" style="margin-right:9px"></span><strong>Agent Live · Adapter review</strong><button aria-label="Close">×</button></div><div style="flex:1;min-height:0">${officeFrame("Agent Live overlay")}</div></section>`;
  } else if (mode === "replace") {
    target.innerHTML = baseShell({ office: true }).replace('<span class="tab">Chat</span><span class="tab">Trajectory</span><span class="tab active">Agent Live</span>', '<span class="tab active">Office workspace</span><span class="tab">Activity</span><span class="tab">History</span>');
  } else if (mode === "skin") {
    target.innerHTML = baseShell({ skin: true });
  } else if (mode === "profile") {
    target.innerHTML = `<main class="profile-shell"><section class="profile-office">${officeFrame("Agent Live custom DeepSeek profile")}<div class="profile-ribbon">DeepSeek Harness runtime · Agent Live profile</div></section><aside class="profile-chat"><div class="session-head"><strong>Adapter review</strong><span class="status">working</span></div><div class="messages"><div class="message user">Map the SessionEvent stream.</div><div class="message">Listening to the active AgentRegistry and session log.</div><div class="tool-row"><span></span> Read · running</div></div><div class="composer">Give the team a task…<div class="composer-tools"><span>DeepSeek V4</span><strong>Send</strong></div></div></aside></main>`;
  }
}
