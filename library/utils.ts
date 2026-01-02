export async function retry<T>(func: () => T | Promise<T>, maxAttempt: number = 3, attempt: number = 1, error?: Error): Promise<T> {
	if (attempt > maxAttempt) throw new Error(error?.message);
	try {
		const res: T = await func();
		return res;
	} catch (error) {
		await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1) * (attempt + 1))
		);
		return await retry(func, maxAttempt, attempt + 1, error);
	}
}

