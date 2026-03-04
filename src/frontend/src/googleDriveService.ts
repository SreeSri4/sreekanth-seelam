const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient: any = null;
console.log("🔥 NEW Google Drive Service Loaded");

export async function initGoogleAuth(): Promise<void> {
  return new Promise((resolve) => {
    const checkGoogleLoaded = () => {
      if (window.google && window.google.accounts) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: () => {},
        });

        resolve();
      } else {
        setTimeout(checkGoogleLoaded, 200);
      }
    };

    checkGoogleLoaded();
  });
}

export async function login(): Promise<string> {
  if (!tokenClient) {
    throw new Error("Google Auth not initialized");
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response: any) => {
      if (response.error) {
        reject(response);
      } else {
        resolve(response.access_token);
      }
    };

    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export async function readJsonFile(fileId: string) {
  const accessToken = await login();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch file");
  }

  return response.json();
}
