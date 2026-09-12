export function installCodexControls(token) {
	const t = (key) => window.AgentLiveI18n?.t(key) ?? key;
	const form = document.getElementById("clientControls");
	const input = document.getElementById("promptInput");
	const send = document.getElementById("sendPrompt");
	const stop = document.getElementById("stopTurn");
	const approval = document.getElementById("approval");
	const approvalTitle = document.getElementById("approvalTitle");
	const approvalDetail = document.getElementById("approvalDetail");
	let currentApproval = null;
	let busy = false;
	let disconnected = false;
	let stopping = false;
	let refreshTimer = 0;
	let closed = false;
	const originalPlaceholder = input.placeholder;
	form.hidden = false;

	async function post(path, body = {}) {
		const response = await fetch(`/api/client/${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-agent-live-token": token },
			body: JSON.stringify(body),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
		return result;
	}

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const text = input.value.trim();
		if (!text || busy || disconnected) return;
		send.disabled = true;
		try {
			await post("prompt", { text });
			input.value = "";
		} catch (error) {
			input.setCustomValidity(error.message);
			input.reportValidity();
			input.setCustomValidity("");
		} finally {
			send.disabled = busy || disconnected;
		}
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			form.requestSubmit();
		}
	});

	stop.addEventListener("click", async () => {
		if (!busy || stopping) return;
		stopping = true;
		stop.disabled = true;
		stop.textContent = t("client.stopping");
		try {
			await post("interrupt");
		} catch {
			stopping = false;
			stop.textContent = t("client.stop");
			stop.disabled = !busy;
		}
	});
	approval.addEventListener("click", (event) => {
		const decision = event.target.closest("[data-approval]")?.dataset.approval;
		if (!decision || !currentApproval) return;
		void post("approval", { id: currentApproval.id, allow: decision === "allow" })
			.then(() => {
				currentApproval = null;
				approval.hidden = true;
				clearTimeout(refreshTimer);
				void refresh();
			})
			.catch((error) => { approvalDetail.textContent = error.message; });
	});

	async function refresh() {
		if (closed || document.hidden) return;
		try {
			const response = await fetch("/api/client/status", {
				cache: "no-store",
				headers: { "x-agent-live-token": token },
			});
			const status = await response.json();
			if (!response.ok) throw new Error(status.error ?? "Unable to read client status");
			disconnected = Boolean(status.error);
			input.disabled = disconnected;
			input.placeholder = status.error ? `${status.error}. Reopen Agent Live to reconnect.` : originalPlaceholder;
			currentApproval = status.approval;
			approval.hidden = !currentApproval;
			if (currentApproval) {
				approvalTitle.textContent = window.AgentLiveI18n?.text(currentApproval.title) ?? currentApproval.title;
				approvalDetail.textContent = window.AgentLiveI18n?.text(currentApproval.detail) ?? currentApproval.detail;
			}
				busy = Boolean(status.busy);
				stopping = busy && Boolean(status.interrupting);
				stop.textContent = t(stopping ? "client.stopping" : "client.stop");
				stop.disabled = !busy || stopping;
				send.disabled = busy || disconnected;
		} catch {
			stop.disabled = true;
		} finally {
			clearTimeout(refreshTimer);
			if (!closed && !document.hidden) refreshTimer = window.setTimeout(refresh, busy ? 750 : 2000);
		}
	}
	void refresh();
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			clearTimeout(refreshTimer);
			return;
		}
		void refresh();
	});
	window.addEventListener("pagehide", () => {
		closed = true;
		clearTimeout(refreshTimer);
	}, { once: true });
}
