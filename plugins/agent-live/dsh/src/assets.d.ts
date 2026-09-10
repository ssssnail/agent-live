declare module "agent-live-frame-document" {
  const source: (content?: unknown) => string;
  export default source;
}

declare module "*.json" {
  const value: any;
  export default value;
}
