
import json

from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = ["https://www.googleapis.com/auth/drive.file"]


flow = InstalledAppFlow.from_client_secrets_file(
    "credentials.json",
    SCOPES
)

credentials = flow.run_local_server(
    port=0,
    access_type="offline",
    prompt="consent"
)

drive = build(
    "drive",
    "v3",
    credentials=credentials,
    cache_discovery=False
)

# Cria a pasta no Google Drive
pasta = drive.files().create(
    body={
        "name": "Speaking Assessment",
        "mimeType": "application/vnd.google-apps.folder"
    },
    fields="id"
).execute()

# Obtém as credenciais do cliente OAuth
with open("credentials.json", encoding="utf-8") as f:
    config = json.load(f)["installed"]

print("\n===== CONFIGURAÇÕES PARA O RENDER =====\n")

print("GOOGLE_CLIENT_ID=" + config["client_id"])
print("GOOGLE_CLIENT_SECRET=" + config["client_secret"])
print("GOOGLE_REFRESH_TOKEN=" + credentials.refresh_token)
print("GOOGLE_FOLDER_ID=" + pasta["id"])

print("\nPasta criada no Google Drive!")
print("ID:", pasta["id"])
