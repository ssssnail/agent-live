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
	let renderedApprovalId = null;
	const approvalInputs = document.createElement("div");
	approvalInputs.className = "approval-inputs";
	approvalDetail.after(approvalInputs);
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
		} catch (error) {
			stopping = false;
			stop.textContent = t("client.stop");
			stop.disabled = !busy;
			stop.title = error.message;
			input.setCustomValidity(error.message);
			input.reportValidity();
			input.setCustomValidity("");
			console.error("Agent Live could not stop the Codex turn.", error);
		}
	});
	approval.addEventListener("click", (event) => {
		const decision = event.target.closest("[data-approval]")?.dataset.approval;
		if (!decision || !currentApproval) return;
		let answer;
		try {
			if (decision === "allow" && currentApproval.questions) {
				answer = Object.fromEntries([...approvalInputs.querySelectorAll("input")].map((field) => [field.name, field.value]));
			} else if (decision === "allow" && currentApproval.schema) {
				answer = JSON.parse(approvalInputs.querySelector("textarea").value);
			}
		} catch {
			approvalDetail.textContent = t("client.invalidForm");
			return;
		}
		void post("approval", { id: currentApproval.id, allow: decision === "allow", input: answer })
			.then(() => {
				currentApproval = null;
				renderedApprovalId = null;
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
				if (currentApproval.questions) approvalTitle.textContent = t("client.questions");
				if (currentApproval.method === "item/permissions/requestApproval") approvalTitle.textContent = t("client.permissions");
				approval.querySelector('[data-approval="allow"]').textContent = t(currentApproval.questions || currentApproval.schema ? "client.submitAnswers" : "approval.allow");
				approvalDetail.textContent = window.AgentLiveI18n?.text(currentApproval.detail) ?? currentApproval.detail;
				if (renderedApprovalId !== currentApproval.id) {
					renderedApprovalId = currentApproval.id;
					approvalInputs.replaceChildren();
					for (const question of currentApproval.questions ?? []) {
						const label = document.createElement("label");
						label.textContent = question.question;
						const field = document.createElement("input");
						field.name = question.id;
						field.type = question.isSecret ? "password" : "text";
						field.autocomplete = "off";
						label.append(field);
						for (const option of question.options ?? []) {
							const choice = document.createElement("button");
							choice.type = "button";
							choice.className = "btn";
							choice.textContent = option.label;
							choice.title = option.description ?? "";
							choice.addEventListener("click", () => { field.value = option.label; });
							label.append(choice);
						}
						approvalInputs.append(label);
					}
					if (currentApproval.schema) {
						const schema = document.createElement("pre");
						schema.textContent = JSON.stringify(currentApproval.schema, null, 2);
						const field = document.createElement("textarea");
						field.placeholder = t("client.formJson");
						field.setAttribute("aria-label", t("client.formJson"));
						approvalInputs.append(schema, field);
					}
					if (currentApproval.url) {
						let url;
						try { url = new URL(currentApproval.url); } catch { /* Invalid links must not disable Stop. */ }
						if (url && ["https:", "http:"].includes(url.protocol)) {
							const link = document.createElement("a");
							link.href = url.href;
							link.textContent = url.href;
							link.target = "_blank";
							link.rel = "noopener noreferrer";
							approvalInputs.append(link);
						}
					}
				}
			} else {
				renderedApprovalId = null;
				approvalInputs.replaceChildren();
			}
				busy = Boolean(status.busy);
				stopping = busy && Boolean(status.interrupting);
				stop.textContent = t(stopping ? "client.stopping" : "client.stop");
				if (!stopping) stop.title = "";
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
