import { put, list, del } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const blobs = await list();
    const file = blobs.blobs.find(b => b.pathname === "portfolio.json");

    if (!file) return res.status(200).json({});

    const response = await fetch(file.url);
    const data = await response.json();

    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const updatedData = req.body;

    await put("portfolio.json", JSON.stringify(updatedData), {
      access: "public",
      contentType: "application/json",
      overwrite: true,
    });

    return res.status(200).json({ success: true });
  }

  res.status(405).end();
}
