const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export type GetToken = () => Promise<string | null>;

async function request<T>(
    getToken: GetToken,
    path: string,
    init: { method: string; body?: unknown }
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
        throw new ApiError(response.status, String(message));
    }

    return data as T;
}

export function createApiClient(getToken: GetToken) {
    return {
        get: <T>(path: string) => request<T>(getToken, path, { method: "GET" }),
        post: <T>(path: string, body?: unknown) => request<T>(getToken, path, { method: "POST", body }),
        patch: <T>(path: string, body?: unknown) => request<T>(getToken, path, { method: "PATCH", body }),
        del: <T>(path: string) => request<T>(getToken, path, { method: "DELETE" }),
    };
}

export type ApiClient = ReturnType<typeof createApiClient>;
