import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  AgentLiveRuntime, OfficeContentService, CreatorService, CreatorCommandRouter,
  defineAdapter, connectAdapter, createOfficeEventPublisher,
} from "agent-live";

// Public exports only. Replace this host subscription with your host's
// documented event-to-OfficeDelta mapping.
const adapter = defineAdapter({
  id: "example",
  name: "Example",
  connect({ host, office }) { return host.subscribe((event) => office.publish(event)); },
});

export async function startExample({ host, cwd = process.cwd(), dataRoot, port = 0 }) {
  const runtime = new AgentLiveRuntime(cwd, { dataRoot });
  let connection;
  let closePromise;
  const close = () => closePromise ??= (async () => {
    const results = await Promise.allSettled([connection?.close(), runtime.close()]);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Example cleanup failed");
  })();
  try {
    const content = await OfficeContentService.create({ dataRoot });
    const creator = new CreatorService(content.registry, content.library);
    const commands = new CreatorCommandRouter(creator);
    connection = await connectAdapter(adapter, { host, office: createOfficeEventPublisher(runtime.state) });
    const token = randomBytes(24).toString("hex");
    const server = await runtime.start({ port, content, creator: commands, creatorToken: token });
    return { url: `${server.url}/v2.html?token=${token}`, close, creator, commands };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = {
    subscribe(publish) {
      publish({ type: "agent_join", agent: { id: "main", name: "Example", role: "Agent", state: "idle", tokens: 0, cost: 0, toolCalls: 0, joinedAt: Date.now() } });
      return () => {};
    },
  };
  const office = await startExample({ host });
  console.log(office.url);
  console.log("Press Ctrl+C to close this example. Host adapters choose their own normal exit policy.");
  const stop = () => void office.close().catch(console.error);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
