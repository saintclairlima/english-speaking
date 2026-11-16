
let frases = [];
let indice = 0;
let gravador = null;
let partesAudio = [];

const aluno = document.getElementById("aluno");
const frase = document.getElementById("frase");
const status = document.getElementById("status");

const botaoGravar = document.getElementById("gravar");
const botaoParar = document.getElementById("parar");
const botaoProxima = document.getElementById("proxima");

const resultado = document.getElementById("resultado");
const transcricao = document.getElementById("transcricao");


async function carregarFrases() {
    const resposta = await fetch("/api/frases");
    const atividade = await resposta.json();

    frases = atividade.frases;

    document.getElementById("total").textContent =
        `Total: ${frases.length}`;

    mostrarFrase();
}


function mostrarFrase() {
    frase.textContent = frases[indice];

    document.getElementById("progresso").textContent =
        `Question ${indice + 1} of ${frases.length}`;

    resultado.hidden = true;
    botaoProxima.hidden = true;

    botaoGravar.disabled = false;
    botaoParar.disabled = true;

    status.textContent = "Press the button to start recording.";
}


async function iniciarGravacao() {
    if (!aluno.value.trim()) {
        alert("Please enter your name.");
        aluno.focus();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        let tipo = "";

        const formatos = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus"
        ];

        tipo = formatos.find(
            formato => MediaRecorder.isTypeSupported(formato)
        ) || "";

        gravador = tipo
            ? new MediaRecorder(stream, { mimeType: tipo })
            : new MediaRecorder(stream);

        partesAudio = [];

        gravador.ondataavailable = evento => {
            if (evento.data.size > 0) {
                partesAudio.push(evento.data);
            }
        };

        gravador.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());

            const audio = new Blob(partesAudio, {
                type: gravador.mimeType
            });

            await enviarAudio(audio);
        };

        gravador.start();

        botaoGravar.disabled = true;
        botaoParar.disabled = false;

        status.textContent = "Recording...";

    } catch (erro) {
        console.error(erro);
        alert("Unable to access the microphone.");
    }
}


function pararGravacao() {
    if (gravador && gravador.state === "recording") {
        gravador.stop();

        botaoParar.disabled = true;
        status.textContent = "Processing audio...";
    }
}


async function enviarAudio(audio) {
    try {
        const dados = new FormData();

        dados.append("aluno", aluno.value.trim());
        dados.append("frase_index", indice);

        const extensao = gravador.mimeType.includes("ogg")
            ? "ogg"
            : gravador.mimeType.includes("mp4")
                ? "mp4"
                : "webm";

        dados.append("audio", audio, `gravacao.${extensao}`);

        const resposta = await fetch("/api/enviar", {
            method: "POST",
            body: dados
        });

        const retorno = await resposta.json();

        if (!resposta.ok) {
            throw new Error(retorno.detail || "Upload failed.");
        }

        transcricao.textContent = retorno.transcricao;
        resultado.hidden = false;

        status.textContent = "Recording successfully saved!";

        botaoProxima.hidden = false;
        botaoGravar.disabled = true;

    } catch (erro) {
        console.error(erro);

        status.textContent = "Error saving recording.";

        alert(erro.message);
        botaoGravar.disabled = false;
    }
}


function proximaFrase() {
    if (indice < frases.length - 1) {
        indice++;
        mostrarFrase();
    } else {
        frase.textContent = "Activity completed!";
        status.textContent = "All recordings have been submitted.";

        botaoGravar.hidden = true;
        botaoParar.hidden = true;
        botaoProxima.hidden = true;
    }
}


botaoGravar.addEventListener("click", iniciarGravacao);
botaoParar.addEventListener("click", pararGravacao);
botaoProxima.addEventListener("click", proximaFrase);

carregarFrases().catch(erro => {
    console.error(erro);
    status.textContent = "Unable to load the activity.";
});
