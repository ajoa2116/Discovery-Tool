/** Deadline covers both receiving headers and reading JSON, even if a transport ignores abort. */
export async function requestJson(url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch, timeoutMs = 15000): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const parent = init.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { reject(new DOMException('Request cancelled', 'AbortError')); controller.abort(); };
    timer = setTimeout(() => { reject(new DOMException('Request timed out', 'TimeoutError')); controller.abort(); }, timeoutMs);
    if (parent?.aborted) cancel();
    else parent?.addEventListener('abort', cancel, { once: true });
  });
  try {
    if (parent?.aborted) return await interrupted;
    return await Promise.race([
      interrupted,
      (async () => { const response = await fetcher(url, { ...init, signal: controller.signal }); return { response, body: await response.json() as unknown }; })(),
    ]);
  } finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel); }
}
