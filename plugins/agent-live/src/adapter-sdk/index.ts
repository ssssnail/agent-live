import type { OfficeDelta } from "../core/protocol.ts";
import type { OfficeState } from "../core/state.ts";

export type MaybePromise<T> = T | Promise<T>;
export type AdapterCleanup = () => MaybePromise<void>;

export interface AdapterCapabilities {
	observe: boolean;
	prompt: boolean;
	interrupt: boolean;
	approve: boolean;
	modelSelect: boolean;
	embeddedView: boolean;
}

export interface AdapterControls {
	prompt?(text: string): Promise<unknown>;
	interrupt?(): Promise<unknown>;
	approve?(id: string, allowed: boolean): MaybePromise<unknown>;
	selectModel?(model: string): MaybePromise<unknown>;
}

export interface OfficeEventPublisher {
	publish(event: OfficeDelta): void;
}

export interface AdapterContext<Host> {
	readonly host: Host;
	readonly office: OfficeEventPublisher;
}

export interface AdapterDefinition<Host = unknown> {
	readonly id: string;
	readonly name: string;
	readonly connect: (context: AdapterContext<Host>) => MaybePromise<void | AdapterCleanup | { close(): MaybePromise<void> }>;
	readonly controls?: AdapterControls;
	readonly mountView?: (host: Host) => MaybePromise<void | AdapterCleanup>;
}

export interface ConnectedAdapter {
	readonly id: string;
	readonly name: string;
	readonly capabilities: Readonly<AdapterCapabilities>;
	close(): Promise<void>;
}

export function defineAdapter<Host>(definition: AdapterDefinition<Host>): AdapterDefinition<Host> {
	if (typeof definition?.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(definition.id)) {
		throw new TypeError("adapter id must use lowercase letters, numbers, and hyphens");
	}
	if (typeof definition.name !== "string" || !definition.name.trim()) throw new TypeError("adapter name is required");
	if (typeof definition.connect !== "function") throw new TypeError("adapter connect() is required");
	return Object.freeze({ ...definition });
}

export function adapterCapabilities<Host>(definition: AdapterDefinition<Host>): Readonly<AdapterCapabilities> {
	return Object.freeze({
		observe: true,
		prompt: typeof definition.controls?.prompt === "function",
		interrupt: typeof definition.controls?.interrupt === "function",
		approve: typeof definition.controls?.approve === "function",
		modelSelect: typeof definition.controls?.selectModel === "function",
		embeddedView: typeof definition.mountView === "function",
	});
}

export async function connectAdapter<Host>(definition: AdapterDefinition<Host>, context: AdapterContext<Host>): Promise<ConnectedAdapter> {
	const connection = await definition.connect(context);
	let viewCleanup: void | AdapterCleanup;
	try {
		viewCleanup = definition.mountView ? await definition.mountView(context.host) : undefined;
	} catch (error) {
		if (typeof connection === "function") await connection();
		else if (connection && typeof connection.close === "function") await connection.close();
		throw error;
	}
	let closed = false;
	const dispose = async (value: void | AdapterCleanup | { close(): MaybePromise<void> }) => {
		if (typeof value === "function") await value();
		else if (value && typeof value.close === "function") await value.close();
	};
	return {
		id: definition.id,
		name: definition.name,
		capabilities: adapterCapabilities(definition),
		async close() {
			if (closed) return;
			closed = true;
			const results = await Promise.allSettled([dispose(viewCleanup), dispose(connection)]);
			const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
			if (failures.length) throw new AggregateError(failures, `adapter ${definition.id} did not close cleanly`);
		},
	};
}

export function createOfficeEventPublisher(state: OfficeState): OfficeEventPublisher {
	return {
		publish(event) {
			switch (event.type) {
				case "session": state.updateSession(event.session); break;
				case "agent_join": {
					const agent = event.agent;
					state.join(agent.id, { name: agent.name, role: agent.role, parent: agent.parent, model: agent.model, task: agent.task });
					if (agent.state !== "idle") state.setState(agent.id, agent.state, agent.detail);
					if (agent.tokens || agent.cost) state.addUsage(agent.id, agent.tokens, agent.cost);
					break;
				}
				case "agent_leave": state.leave(event.id, event.ok); break;
				case "agent_state": state.setState(event.id, event.state, event.detail); break;
				case "task": state.setTask(event.id, event.task); break;
				case "thought": state.pushThought(event.id, event.text); break;
				case "say": state.say(event.id, event.text); break;
				case "action": state.startAction(event.id, event.toolCallId, event.action, event.label); break;
				case "action_end": state.endAction(event.id, event.toolCallId, event.ok); break;
				case "delegate": state.delegate(event.from, event.to, event.task); break;
				case "usage": state.addUsage(event.id, event.tokens, event.cost); break;
				case "log": state.addLog(event.item.agentId, event.item.kind, event.item.text); break;
			}
		},
	};
}
