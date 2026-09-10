declare module "@earendil-works/pi-coding-agent" {
	export interface ExtensionAPI {
		on(name: string, handler: (event: any, context: any) => any): void;
		registerCommand(name: string, definition: any): void;
		registerTool(definition: any): void;
	}
}
