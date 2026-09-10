export type ResourceDisposer = () => void | Promise<void>;

export interface TrackedResourceOptions {
	timeoutMs?: number;
}

const DEFAULT_CLEANUP_TIMEOUT_MS = 5_000;

/**
 * Host-neutral last-resort cleanup for resources owned by Agent Live.
 * It does not decide when an adapter should stop or manage host-owned resources.
 */
export class ResourceGuard {
	private readonly resources: Array<{ name: string; dispose: ResourceDisposer; timeoutMs: number }> = [];
	private closePromise: Promise<void> | null = null;
	private closed = false;

	track(name: string, dispose: ResourceDisposer, options: TrackedResourceOptions = {}): () => void {
		if (this.closed || this.closePromise) throw new Error(`Cannot track ${name}: resource guard is closing`);
		const resource = { name, dispose, timeoutMs: options.timeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS };
		this.resources.push(resource);
		return () => {
			const index = this.resources.indexOf(resource);
			if (index >= 0) this.resources.splice(index, 1);
		};
	}

	close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		if (this.closed) return Promise.resolve();
		this.closePromise = this.disposeAll().finally(() => {
			this.closed = true;
			this.closePromise = null;
		});
		return this.closePromise;
	}

	private async disposeAll(): Promise<void> {
		const failures: Error[] = [];
		for (const resource of this.resources.splice(0).reverse()) {
			try {
				await withTimeout(Promise.resolve().then(resource.dispose), resource.timeoutMs, resource.name);
			} catch (error) {
				failures.push(error instanceof Error ? error : new Error(String(error)));
			}
		}
		if (failures.length) throw new AggregateError(failures, "One or more Agent Live resources failed to close");
	}
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, name: string): Promise<T> {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation;
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Timed out closing ${name} after ${timeoutMs}ms`)), timeoutMs);
		operation.then(
			(value) => { clearTimeout(timer); resolve(value); },
			(error) => { clearTimeout(timer); reject(error); },
		);
	});
}
