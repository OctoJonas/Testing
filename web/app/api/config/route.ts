/**
 * Backend configuration info — replaces the Flask `/api/config` endpoint.
 */
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_EXCEL_ROWS = Number(process.env.MAX_EXCEL_ROWS ?? 10_000);

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    cors_enabled: true,
    max_file_size_mb: MAX_FILE_BYTES / (1024 * 1024),
    max_excel_rows: MAX_EXCEL_ROWS,
    allowed_extensions: [".xlsx", ".xls"],
  });
}
