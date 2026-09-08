const DEFAULT_LOCALE = "en";

export async function loadI18n(query) {
	const requested = query.get("lang") || DEFAULT_LOCALE;
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
	return api;
}
