const DEFAULT_LOCALE = "en";
const LOCALE_STORAGE_KEY = "agent-live:locale";

export async function loadI18n(query) {
	let saved = "";
	try { saved = localStorage.getItem(LOCALE_STORAGE_KEY) ?? ""; } catch {}
	const requested = query.get("lang") || saved || DEFAULT_LOCALE;
	const locale = requested.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
	const response = await fetch(`/v2/locales/${locale}.json`, { cache: "no-cache" });
	if (!response.ok) throw new Error(`Unable to load locale: ${locale}`);
	const bundle = await response.json();
	const api = {
		locale,
		t(key, vars = {}) {
			let value = bundle.strings?.[key] ?? key;
			for (const [name, replacement] of Object.entries(vars)) {
				value = value.replaceAll(`{${name}}`, String(replacement));
			}
			return value;
		},
		text(value) {
			const source = String(value ?? "");
			const exact = bundle.text?.[source];
			if (exact) return exact;
			for (const pattern of bundle.patterns ?? []) {
				const match = source.match(new RegExp(pattern.source));
				if (match) return source.replace(new RegExp(pattern.source), pattern.replace);
			}
			return source;
		},
	};
	document.documentElement.lang = locale;
	window.AgentLiveI18n = api;
	for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = api.t(element.dataset.i18n);
	for (const element of document.querySelectorAll("[data-i18n-placeholder]")) element.placeholder = api.t(element.dataset.i18nPlaceholder);
	for (const element of document.querySelectorAll("[data-i18n-title]")) {
		const value = api.t(element.dataset.i18nTitle);
		element.title = value;
		element.setAttribute("aria-label", value);
	}
	const language = document.getElementById("language");
	if (language) {
		language.textContent = locale === "en" ? "中文" : "EN";
		language.setAttribute("aria-label", api.t("nav.language"));
		language.addEventListener("click", () => {
			const next = locale === "en" ? "zh-CN" : "en";
			try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
			const url = new URL(location.href);
			url.searchParams.set("lang", next);
			location.href = url.toString();
		});
	}
	return api;
}
