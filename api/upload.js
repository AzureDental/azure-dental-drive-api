import { google } from "googleapis";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

export const config = {
  api: {
    bodyParser: false,
  },
};

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  upload.any()(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    try {
      const uploadedFiles = [];

      for (const file of req.files) {
        const response = await drive.files.create({
          requestBody: {
            name: file.originalname,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
          },
          media: {
            mimeType: file.mimetype,
            body: Buffer.from(file.buffer),
          },
          fields: "id, webViewLink",
          supportsAllDrives: true,
        });

        uploadedFiles.push({
          fileId: response.data.id,
          url: response.data.webViewLink,
          name: file.originalname,
        });
      }

      res.status(200).json({ files: uploadedFiles });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
