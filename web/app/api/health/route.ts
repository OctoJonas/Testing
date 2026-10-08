/**
 * Health check — replaces the Flask `/health` endpoint. Same JSON shape so
 * uptime monitors and Fly health checks need no change after cutover.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "healthy",
    service: "octonomy-test-client",
    version: "3.0.0-next",
    environment: process.env.NODE_ENV ?? "development",
  });
}
