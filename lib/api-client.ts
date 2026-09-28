const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export class ApiError extends Error {
    status: number;
    /** Machine-readable reason from the server, e.g. "plan_limit". */
    code?: string;
    constructor(status: number, message: string, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

/** True when the server refused because the user's plan doesn't include it. */
export const isPlanLimitError = (e: unknown): e is ApiError => e instanceof ApiError && e.code === "plan_limit";

export type GetToken = () => Promise<string | null>;

async function request<T>(
    getToken: GetToken,
    path: string,
    init: { method: string; body?: unknown; text?: boolean }
): Promise<T> {
    if (!BASE_URL) {
        throw new Error(
            "EXPO_PUBLIC_API_BASE_URL is not set. Add it to .env.local — it must be your admin server's " +
                "reachable address (e.g. http://<your-computer's-LAN-IP>:3000), not localhost, so a physical " +
                "device or emulator can reach it."
        );
    }

    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE_URL}${path}`, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    // Non-JSON downloads (e.g. the CSV export): hand back the text as-is.
    if (init.text && response.ok) return text as T;
    // A proxy/gateway can answer with an HTML error page; never surface a raw
    // JSON parse error to the user.
    let data: unknown;
    try {
        data = text ? JSON.parse(text) : undefined;
    } catch {
        if (!response.ok) throw new ApiError(response.status, "Something went wrong on our end. Please try again.");
        throw new ApiError(response.status, "Unexpected response from the server. Please try again.");
    }

    if (!response.ok) {
        const message = (data && typeof data === "object" && "error" in data ? data.error : null) ?? response.statusText;
        const code = data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : undefined;
        throw new ApiError(response.status, String(message), code);
    }

    return data as T;
}

export function createApiClient(getToken: GetToken) {
    return {
        get: <T>(path: string) => request<T>(getToken, path, { method: "GET" }),
        /** GET a non-JSON body (errors still come back as ApiError). */
        getText: (path: string) => request<string>(getToken, path, { method: "GET", text: true }),
        post: <T>(path: string, body?: unknown) => request<T>(getToken, path, { method: "POST", body }),
        patch: <T>(path: string, body?: unknown) => request<T>(getToken, path, { method: "PATCH", body }),
        put: <T>(path: string, body?: unknown) => request<T>(getToken, path, { method: "PUT", body }),
        del: <T>(path: string) => request<T>(getToken, path, { method: "DELETE" }),
    };
}

export type ApiClient = ReturnType<typeof createApiClient>;
