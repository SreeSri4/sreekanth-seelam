import { put, head } from "@vercel/blob";

export default async function handler(req, res) {
  const filename = "portfolio.json";

  if (req.method === "GET") {
    try {
      const blob = await head(filename);
      const response = await fetch(blob.url);
      const data = await response.json();
      return res.status(200).json(data);
    } catch {
      return res.status(200).json({});
    }
  }

  if (req.method === "POST") {
    try {
      await put(filename, JSON.stringify(req.body), {
        access: "public",
        contentType: "application/json",
        overwrite: true,
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Blob save error:", err);
      return res.status(500).json({ error: "Save failed" });
    }
  }

  return res.status(405).end();
}
