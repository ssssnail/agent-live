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
		if (!text || busy) return;
		send.disabled = true;
		try {
			await post("prompt", { text });
			input.value = "";
		} catch (error) {
			input.setCustomValidity(error.message);
			input.reportValidity();
			input.setCustomValidity("");
		} finally {
			send.disabled = busy;
		}
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			form.requestSubmit();
		}
	});

	stop.addEventListener("click", () => void post("interrupt").catch(() => {}));
	approval.addEventListener("click", (event) => {
		const decision = event.target.closest("[data-approval]")?.dataset.approval;
		if (!decision || !currentApproval) return;
		void post("approval", { id: currentApproval.id, allow: decision === "allow" })
			.then(() => {
				currentApproval = null;
				approval.hidden = true;
			})
			.catch(() => {});
	});

	async function refresh() {
		try {
			const response = await fetch("/api/client/status", { cache: "no-store" });
			const status = await response.json();
			currentApproval = status.approval;
			approval.hidden = !currentApproval;
			if (currentApproval) {
				approvalTitle.textContent = window.AgentLiveI18n?.text(currentApproval.title) ?? currentApproval.title;
				approvalDetail.textContent = window.AgentLiveI18n?.text(currentApproval.detail) ?? currentApproval.detail;
			}
				busy = Boolean(status.busy);
				stop.disabled = !busy;
				send.disabled = busy;
		} catch {
			stop.disabled = true;
		}
	}
	void refresh();
	setInterval(refresh, 500);
}
