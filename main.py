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

    return build(
        "drive",
        "v3",
        credentials=credentials,
        cache_discovery=False
    )


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


def validar_resposta(aluno, frase_index, audio):
    """Valida os dados e retorna o áudio, a extensão e o MIME type."""

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

    return conteudo_audio, extensao, mime_type


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.get("/api/frases")
def obter_frases():
    return ATIVIDADE


@app.post("/api/analisar")
def analisar_resposta(
    aluno: str = Form(...),
    frase_index: int = Form(...),
    audio: UploadFile = File(...)
):
    """
    Recebe o áudio e retorna a transcrição.
    Não salva nenhum arquivo no Google Drive.
    """

    conteudo_audio, extensao, mime_type = validar_resposta(
        aluno,
        frase_index,
        audio
    )

    try:
        transcricao = openai.audio.transcriptions.create(
            model="gpt-transcribe",
            file=(
                f"gravacao.{extensao}",
                io.BytesIO(conteudo_audio),
                mime_type
            ),
            languages=["en"],
            prompt=(
                "Transcribe the recording verbatim. "
                "Do not correct grammar or vocabulary. "
                "Do not replace spoken words with what the speaker "
                "probably intended to say. "
                "Preserve grammatical mistakes, repetitions, "
                "omissions and unusual word choices. "
                "Write only what you can actually recognize "
                "from the audio."
            )
        )

        return {
            "success": True,
            "transcricao": transcricao.text
        }

    except Exception as e:
        print(f"Erro ao transcrever gravação: {e}")
        raise HTTPException(
            status_code=500,
            detail="Não foi possível analisar a gravação."
        )


@app.post("/api/confirmar")
def confirmar_resposta(
    aluno: str = Form(...),
    frase_index: int = Form(...),
    transcricao: str = Form(...),
    audio: UploadFile = File(...)
):
    """
    Salva no Google Drive o áudio e a transcrição confirmados pelo aluno.
    """

    conteudo_audio, extensao, mime_type = validar_resposta(
        aluno,
        frase_index,
        audio
    )

    if not transcricao.strip():
        raise HTTPException(400, "A transcrição não pode estar vazia.")

    frase = ATIVIDADE["frases"][frase_index]

    try:
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
            f"Transcrição: {transcricao.strip()}\n"
            f"Data: {datetime.now().isoformat()}\n"
        )

        id_texto = salvar_drive(
            drive,
            f"{nome_base}.txt",
            conteudo_texto.encode("utf-8"),
            "text/plain"
        )

        return {
            "success": True,
            "id_audio": id_audio,
            "id_texto": id_texto
        }

    except Exception as e:
        print(f"Erro ao salvar gravação no Google Drive: {e}")
        raise HTTPException(
            status_code=500,
            detail="Não foi possível salvar a gravação."
        )
