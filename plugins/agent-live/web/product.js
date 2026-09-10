const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add("visible");
				observer.unobserve(entry.target);
			}
		},
		{ threshold: 0.12 },
	);
	for (const item of revealItems) observer.observe(item);
} else {
	for (const item of revealItems) item.classList.add("visible");
}

const copyButton = document.getElementById("copy-command");
copyButton?.addEventListener("click", async () => {
	const command = "pi install git:github.com/ssssnail/agent-live";
	try {
		await navigator.clipboard.writeText(command);
		copyButton.textContent = "已复制 ✓";
		setTimeout(() => {
			copyButton.textContent = "复制命令";
		}, 1800);
	} catch {
		copyButton.textContent = "请手动复制";
	}
});
