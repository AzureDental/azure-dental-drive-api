import { google } from "googleapis";
import multer from "multer";
import { Readable } from "stream";

export const config = {
  api: { bodyParser: false },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 25 * 1024 * 1024, // 25MB per file (adjust if needed)
  },
});

function getDriveClient() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!json) throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!folderId) throw new Error("Missing env: GOOGLE_DRIVE_FOLDER_ID");

  let credentials;
  try {
    credentials = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }

  upload.any()(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    let drive;
    try {
      drive = getDriveClient();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    try {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const uploadedFiles = [];

      for (const file of files) {
        const response = await drive.files.create({
          requestBody: {
            name: file.originalname,
            parents: [folderId],
          },
          media: {
            mimeType: file.mimetype,
            body: Readable.from(file.buffer), // IMPORTANT: stream, not raw Buffer
          },
          fields: "id, webViewLink, name",
          supportsAllDrives: true,
        });

        uploadedFiles.push({
          fileId: response.data.id,
          url: response.data.webViewLink,
          name: response.data.name || file.originalname,
        });
      }

      return res.status(200).json({ files: uploadedFiles });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Drive upload failed" });
    }
  });
}
