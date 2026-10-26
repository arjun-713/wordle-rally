export const API_TIMEOUT_MS = 12000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
  ) {
    super(message);
  }
}

export const isGuessRejection = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === "INVALID_GUESS";

// Bound the entire response, including its body. A lost mutation reply does
// not imply that the server failed to save it; callers reconcile before retry.
export async function api<T>(
  url: string,
  data?: unknown,
  signal?: AbortSignal,
  timeoutMs = API_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiError(
          "This request took too long. Please try again.",
          0,
          "REQUEST_TIMEOUT",
        ),
      );
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          method: data ? "POST" : "GET",
          ...(data
            ? {
                body: JSON.stringify(data),
                headers: { "Content-Type": "application/json" },
              }
            : {}),
          cache: "no-store",
          signal: signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal,
        });
        const json = await response.json();
        if (!response.ok)
          throw new ApiError(
            json?.error ?? "Something went wrong. Please try again.",
            response.status,
            json?.code,
          );
        return json as T;
      })(),
      deadline,
    ]);
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError(
      "Could not reach the game. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
  }
}
