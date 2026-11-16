
import os
import io
import json
import re
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from openai import OpenAI

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload


load_dotenv()

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SCOPES = ["https://www.googleapis.com/auth/drive.file"]

ARQUIVO_FRASES = "data/frases.json"

with open(ARQUIVO_FRASES, encoding="utf-8") as f:
    ATIVIDADE = json.load(f)


def obter_drive():
    credentials = Credentials(
        token=None,
        refresh_token=os.getenv("GOOGLE_REFRESH_TOKEN"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=SCOPES
    )

    return build("drive", "v3", credentials=credentials,
                 cache_discovery=False)


def salvar_drive(drive, nome, conteudo, mime_type):
    arquivo = MediaIoBaseUpload(
        io.BytesIO(conteudo),
        mimetype=mime_type,
        resumable=False
    )

    resultado = drive.files().create(
        body={
            "name": nome,
            "parents": [os.getenv("GOOGLE_FOLDER_ID")]
        },
        media_body=arquivo,
        fields="id"
    ).execute()

    return resultado["id"]


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.get("/api/frases")
def obter_frases():
    return ATIVIDADE


@app.post("/api/enviar")
def enviar_resposta(
    aluno: str = Form(...),
    frase_index: int = Form(...),
    audio: UploadFile = File(...)
):
    if not aluno.strip():
        raise HTTPException(400, "Informe o nome do aluno.")

    frases = ATIVIDADE["frases"]

    if frase_index < 0 or frase_index >= len(frases):
        raise HTTPException(400, "Frase inválida.")

    conteudo_audio = audio.file.read()

    if not conteudo_audio:
        raise HTTPException(400, "Áudio vazio.")

    if len(conteudo_audio) > 25 * 1024 * 1024:
        raise HTTPException(413, "Áudio excede 25 MB.")

    extensoes = {
        "audio/webm": ("webm", "audio/webm"),
        "audio/ogg": ("ogg", "audio/ogg"),
        "audio/mp4": ("mp4", "audio/mp4"),
        "audio/wav": ("wav", "audio/wav")
    }

    mime_type = (audio.content_type or "").split(";")[0]

    if mime_type not in extensoes:
        raise HTTPException(400, "Formato de áudio não suportado.")

    extensao, mime_type = extensoes[mime_type]

    frase = frases[frase_index]

    try:
        # Transcrição em inglês
        transcricao = openai.audio.transcriptions.create(
            model="gpt-transcribe",
            file=(
                f"gravacao.{extensao}",
                io.BytesIO(conteudo_audio),
                mime_type
            ),
            languages=["en"]
        )

        texto = transcricao.text

        # Preparação dos nomes
        aluno_seguro = re.sub(
            r"[^a-zA-Z0-9_-]",
            "_",
            aluno.strip()
        )[:50]

        identificador = datetime.now().strftime("%Y%m%d_%H%M%S_%f")

        nome_base = (
            f"{aluno_seguro}_"
            f"frase_{frase_index + 1:02d}_"
            f"{identificador}"
        )

        # Armazenamento no Google Drive
        drive = obter_drive()

        id_audio = salvar_drive(
            drive,
            f"{nome_base}.{extensao}",
            conteudo_audio,
            mime_type
        )

        conteudo_texto = (
            f"Aluno: {aluno}\n"
            f"Atividade: {ATIVIDADE['atividade']}\n"
            f"Frase: {frase_index + 1}\n"
            f"Frase original: {frase}\n"
            f"Transcrição: {texto}\n"
            f"Data: {datetime.now().isoformat()}\n"
        )

        salvar_drive(
            drive,
            f"{nome_base}.txt",
            conteudo_texto.encode("utf-8"),
            "text/plain"
        )

        return {
            "success": True,
            "transcricao": texto,
            "id_audio": id_audio
        }

    except Exception as e:
        print(f"Erro ao processar gravação: {e}")
        raise HTTPException(
            status_code=500,
            detail="Não foi possível processar a gravação."
        )
