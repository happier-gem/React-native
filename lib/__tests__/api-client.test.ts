import { ApiError, createApiClient } from "@/lib/api-client";

const reply = (status: number, body: string) =>
    jest.fn(async () => ({ ok: status >= 200 && status < 300, status, statusText: "x", text: async () => body }));

describe("api client", () => {
    afterEach(() => jest.restoreAllMocks());

    it("sends the Clerk token and returns parsed JSON", async () => {
        const fetchMock = reply(200, '{"plan":"pro"}');
        global.fetch = fetchMock as unknown as typeof fetch;
        const api = createApiClient(async () => "tok");
        expect(await api.get("/api/me/plan")).toEqual({ plan: "pro" });
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/me\/plan$/),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) })
        );
    });

    it("uses the server's error message", async () => {
        global.fetch = reply(503, '{"error":"Payments aren\'t available right now."}') as unknown as typeof fetch;
        await expect(createApiClient(async () => "t").get("/x")).rejects.toEqual(new ApiError(503, "Payments aren't available right now."));
    });

    it("an HTML error page becomes a friendly ApiError, not a JSON parse error", async () => {
        global.fetch = reply(502, "<html>Bad Gateway</html>") as unknown as typeof fetch;
        const error = await createApiClient(async () => "t").get("/x").catch((e) => e);
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(502);
        expect(error.message).toBe("Something went wrong on our end. Please try again.");
    });

    it("an unreadable success body is an error, not silently undefined", async () => {
        global.fetch = reply(200, "<html>") as unknown as typeof fetch;
        await expect(createApiClient(async () => "t").get("/x")).rejects.toBeInstanceOf(ApiError);
    });

    it("an expired session (no token) sends no Authorization header", async () => {
        const fetchMock = reply(401, '{"error":"Unauthorized"}');
        global.fetch = fetchMock as unknown as typeof fetch;
        await expect(createApiClient(async () => null).get("/x")).rejects.toMatchObject({ status: 401 });
        expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ headers: {} });
    });
});
