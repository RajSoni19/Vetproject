export type ApiClientOptions = {
  baseUrl: string;
  accessToken?: string;
  companyId?: string;
  requestId?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class VetTheVatApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (this.options.accessToken) headers.set("Authorization", `Bearer ${this.options.accessToken}`);
    if (this.options.companyId) headers.set("X-Company-Id", this.options.companyId);
    if (this.options.requestId) headers.set("X-Request-Id", this.options.requestId);

    const response = await fetch(new URL(path, this.options.baseUrl), {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === "object" && payload && "message" in payload ? String(payload.message) : "API request failed";
      const code = typeof payload === "object" && payload && "code" in payload ? String(payload.code) : undefined;
      throw new ApiError(message, response.status, code);
    }

    return payload as T;
  }
}

export function createApiClient(options?: Partial<ApiClientOptions>) {
  const baseUrl = options?.baseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required before connecting to the production API.");
  }
  return new VetTheVatApiClient({ ...options, baseUrl });
}
