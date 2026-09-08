/** Capabilities an adapter can expose without leaking host-specific APIs into the engine. */
export interface AdapterCapabilities {
	observe: boolean;
	prompt: boolean;
	interrupt: boolean;
	modelSelect: boolean;
	approvals: boolean;
	subagents: boolean;
}

export interface AdapterDescriptor {
	id: string;
	name: string;
	capabilities: AdapterCapabilities;
}
