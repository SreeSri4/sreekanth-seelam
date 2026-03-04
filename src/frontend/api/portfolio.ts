import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  const filename = "Portfolio.json";

  if (req.method === "GET") {
    try {
      // 1. Search for the file in your blob storage
      const { blobs } = await list();
      const portfolioBlob = blobs.find((b) => b.pathname === filename);

      if (!portfolioBlob) {
        return res.status(404).json({ error: "File not found" });
      }

      // 2. Fetch the actual content
      const response = await fetch(portfolioBlob.url);
      const data = await response.json();
      
      return res.status(200).json(data);
    } catch (err) {
      console.error("Fetch Error:", err);
      // Don't return 200 if it actually failed!
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  if (req.method === "POST") {
    try {
      // Use the 'add' or 'put' method. 
      // 'put' with the same pathname will overwrite if configured correctly.
      const blob = await put(filename, JSON.stringify(req.body), {
        access: "public",
        addRandomSuffix: false, // This ensures the filename stays "Portfolio.json"
        contentType: "application/json",
      });
      
      return res.status(200).json({ success: true, url: blob.url });
    } catch (err) {
      console.error("Blob save error:", err);
      return res.status(500).json({ error: "Save failed" });
    }
  }

  return res.status(405).end();
}
