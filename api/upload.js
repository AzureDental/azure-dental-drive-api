import { google } from "googleapis";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const maxDuration = 30;

// Basic CORS (handy if you’ll call this from a browser later)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function getEnvOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getDriveClient() {
  let credentials;
  try {
    credentials = JSON.parse(getEnvOrThrow("GOOGLE_SERVICE_ACCOUNT_JSON"));
  } catch (e) {
    throw new Error(
      "Invalid GOOGLE_SERVICE_ACCOUNT_JSON (must be valid JSON string)"
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

export async function POST(request) {
  try {
    const drive = getDriveClient();
    const folderId = getEnvOrThrow("GOOGLE_DRIVE_FOLDER_ID");

    const form = await request.formData();

    // Accept either: file=... OR files=... (covers most clients)
    const files = [
      ...form.getAll("file"),
      ...form.getAll("files"),
    ].filter((x) => x && typeof x === "object" && "arrayBuffer" in x);

    if (!files.length) {
      return jsonResponse(400, {
        error: "No files uploaded (send form-data field name 'file')",
      });
    }

    const uploaded = [];

    for (const f of files) {
      const arrayBuffer = await f.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const response = await drive.files.create({
        requestBody: {
          name: f.name || "upload",
          parents: [folderId],
        },
        media: {
          mimeType: f.type || "application/octet-stream",
          body: Readable.from(buffer),
        },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });

      uploaded.push({
        fileId: response.data.id,
        url: response.data.webViewLink,
        name: f.name,
      });
    }

    return jsonResponse(200, { files: uploaded });
  } catch (err) {
    return jsonResponse(500, { error: err?.message || "Server error" });
  }
}
