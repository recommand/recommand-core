export async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`/api/core/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  return (await response.json()) as any;
}
