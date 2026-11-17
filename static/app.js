let frases = [];
let indice = 0;
let gravador = null;
let streamAtual = null;
let partesAudio = [];
let audioAtual = null;
let mimeTypeAtual = "";
let estado = "carregando";
let iniciandoGravacao = false;

const aluno = document.getElementById("aluno");
const frase = document.getElementById("frase");
const status = document.getElementById("status");

const botaoGravar = document.getElementById("gravar");
const recordIcon = document.getElementById("record-icon");
const recordLabel = document.getElementById("record-label");
const recordingIndicator = document.getElementById("recording-indicator");
const botaoTentarNovamente = document.getElementById("tentar-novamente");
const botaoConfirmar = document.getElementById("confirmar");
const botaoProxima = document.getElementById("proxima");

const resultado = document.getElementById("resultado");
const transcricao = document.getElementById("transcricao");
const progresso = document.getElementById("progresso");
const total = document.getElementById("total");
const progressBar = document.getElementById("progress-bar");

const iconeMicrofone = `
    <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"></path>
        <path d="M19 11a7 7 0 0 1-14 0M12 18v4m-4 0h8"></path>
    </svg>`;

const iconeParar = `
    <svg viewBox="0 0 24 24" focusable="false">
        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
    </svg>`;


async function carregarFrases() {
    const resposta = await fetch("/api/frases");

    if (!resposta.ok) {
        throw new Error("Erro ao carregar a atividade.");
    }

    const atividade = await resposta.json();
    frases = atividade.frases || [];

    if (frases.length === 0) {
        throw new Error("A atividade está vazia.");
    }

    total.textContent = `${frases.length} questões`;
    mostrarFrase();
}


function definirStatus(mensagem, tipo = "") {
    status.textContent = mensagem;
    status.className = `status${tipo ? ` ${tipo}` : ""}`;
}


function atualizarBotaoGravar({ texto, icone = iconeMicrofone, desabilitado = false, gravando = false }) {
    recordLabel.textContent = texto;
    recordIcon.innerHTML = icone;
    botaoGravar.disabled = desabilitado;
    botaoGravar.classList.toggle("is-recording", gravando);
    botaoGravar.setAttribute("aria-label", texto);
    botaoGravar.title = texto;
    recordingIndicator.hidden = !gravando;
}


function mostrarFrase() {
    frase.textContent = frases[indice];
    progresso.textContent = `Questão ${indice + 1} de ${frases.length}`;
    progressBar.style.width = `${((indice + 1) / frases.length) * 100}%`;

    resultado.hidden = true;
    botaoTentarNovamente.disabled = false;
    botaoConfirmar.disabled = false;
    botaoProxima.hidden = true;
    botaoGravar.hidden = false;

    audioAtual = null;
    partesAudio = [];
    estado = "pronto";

    aluno.disabled = indice > 0 || aluno.disabled;

    atualizarBotaoGravar({ texto: "Toque para gravar" });
    definirStatus("Toque no microfone para começar a gravar.");
}


async function alternarGravacao() {
    if (estado === "gravando") {
        pararGravacao();
        return;
    }

    if (estado === "pronto" || estado === "erro") {
        await iniciarGravacao();
    }
}


async function iniciarGravacao() {
    if (iniciandoGravacao || estado === "gravando" || estado === "processando" || estado === "salvando") {
        return;
    }

    if (!aluno.value.trim()) {
        alert("Por favor, escreva o seu nome.");
        aluno.focus();
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        definirStatus("Seu navegador não tem suporte para gravação de áudio.", "error");
        return;
    }

    iniciandoGravacao = true;
    botaoGravar.disabled = true;
    definirStatus("Acessando microfone...");

    try {
        streamAtual = await navigator.mediaDevices.getUserMedia({ audio: true });

        const formatos = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus"
        ];

        const tipoSuportado = formatos.find(tipo => MediaRecorder.isTypeSupported(tipo)) || "";

        gravador = tipoSuportado
            ? new MediaRecorder(streamAtual, { mimeType: tipoSuportado })
            : new MediaRecorder(streamAtual);

        mimeTypeAtual = gravador.mimeType || tipoSuportado || "audio/webm";
        partesAudio = [];
        audioAtual = null;

        gravador.ondataavailable = evento => {
            if (evento.data && evento.data.size > 0) {
                partesAudio.push(evento.data);
            }
        };

        gravador.onerror = evento => {
            console.error("Erro ao gravar:", evento.error || evento);
            encerrarStream();
            estado = "erro";
            atualizarBotaoGravar({ texto: "Tente outra vez" });
            definirStatus("Aconteceu um erro durante a gravação. Por favor, tente outra vez.", "error");
        };

        gravador.onstop = async () => {
            encerrarStream();

            audioAtual = new Blob(partesAudio, {
                type: mimeTypeAtual
            });

            if (!audioAtual.size) {
                estado = "erro";
                atualizarBotaoGravar({ texto: "Tente gravar outra vez" });
                definirStatus("Não houve áudio para gravar. Por favor, tente outra vez.", "error");
                return;
            }

            await analisarAudio(audioAtual);
        };

        gravador.start();
        estado = "gravando";
        aluno.disabled = true;

        atualizarBotaoGravar({
            texto: "Toque para encerrar",
            icone: iconeParar,
            gravando: true
        });
        definirStatus("Gravando... Fale claramente.");

    } catch (erro) {
        console.error(erro);
        encerrarStream();
        estado = "erro";
        atualizarBotaoGravar({ texto: "Tente gravar outra vez" });
        definirStatus("Seu microfone está inacessível. Confirme se o navegador tem permissões para acessar o microfone.", "error");
    } finally {
        iniciandoGravacao = false;
    }
}


function pararGravacao() {
    if (!gravador || gravador.state !== "recording") {
        return;
    }

    estado = "processando";
    atualizarBotaoGravar({ texto: "Processando áudio...", desabilitado: true });
    definirStatus("Processando sua gravação. Por favor, aguarde...");
    gravador.stop();
}


function encerrarStream() {
    if (streamAtual) {
        streamAtual.getTracks().forEach(track => track.stop());
        streamAtual = null;
    }
}


function obterExtensaoAudio(audio) {
    const mimeType = (audio.type || mimeTypeAtual).split(";")[0].toLowerCase();

    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("wav")) return "wav";
    return "webm";
}


function adicionarDadosAudio(dados, audio) {
    const extensao = obterExtensaoAudio(audio);
    dados.append("audio", audio, `gravacao.${extensao}`);
}


async function obterRetorno(resposta) {
    let retorno;

    try {
        retorno = await resposta.json();
    } catch {
        throw new Error("Resposta inválida recebida pelo servidor.");
    }

    if (!resposta.ok) {
        throw new Error(retorno.detail || "Não foi possível concluir a requisição.");
    }

    return retorno;
}


async function analisarAudio(audio) {
    const dados = new FormData();
    dados.append("aluno", aluno.value.trim());
    dados.append("frase_index", indice);
    adicionarDadosAudio(dados, audio);

    try {
        const resposta = await fetch("/api/analisar", {
            method: "POST",
            body: dados
        });

        const retorno = await obterRetorno(resposta);

        if (!retorno.transcricao?.trim()) {
            throw new Error("Não foi possível identificar o que você falou. Por favor, tente outra vez.");
        }

        transcricao.textContent = retorno.transcricao;
        resultado.hidden = false;
        estado = "revisao";

        atualizarBotaoGravar({ texto: "Gravação analisada", desabilitado: true });
        definirStatus("Revise o resultado de sua fala antes de confirmar.");

    } catch (erro) {
        console.error(erro);
        estado = "erro";
        resultado.hidden = true;
        atualizarBotaoGravar({ texto: "Tente outra vez" });
        definirStatus(erro.message || "Não foi possível analisar a gravação.", "error");
    }
}


async function tentarNovamente() {
    if (estado !== "revisao" && estado !== "erro") {
        return;
    }

    resultado.hidden = true;
    audioAtual = null;
    partesAudio = [];
    estado = "pronto";
    definirStatus("Grave sua frase outra vez.");
    await iniciarGravacao();
}


async function confirmarResposta() {
    if (estado !== "revisao" || !audioAtual) {
        return;
    }

    estado = "salvando";
    botaoTentarNovamente.disabled = true;
    botaoConfirmar.disabled = true;
    atualizarBotaoGravar({ texto: "Salvando gravação...", desabilitado: true });
    definirStatus("Salvando sua resposta. Por favor, aguarde...");

    const dados = new FormData();
    dados.append("aluno", aluno.value.trim());
    dados.append("frase_index", indice);
    dados.append("transcricao", transcricao.textContent);
    adicionarDadosAudio(dados, audioAtual);

    try {
        const resposta = await fetch("/api/confirmar", {
            method: "POST",
            body: dados
        });

        await obterRetorno(resposta);

        estado = "salvo";
        audioAtual = null;
        partesAudio = [];
        resultado.hidden = true;
        botaoGravar.hidden = true;
        botaoProxima.hidden = false;
        definirStatus("Gravação salva!", "success");

    } catch (erro) {
        console.error(erro);
        estado = "revisao";
        botaoTentarNovamente.disabled = false;
        botaoConfirmar.disabled = false;
        atualizarBotaoGravar({ texto: "Gravação analisada", desabilitado: true });
        definirStatus(`${erro.message} Confirme outra vez.`, "error");
    }
}


function proximaFrase() {
    if (estado !== "salvo") {
        return;
    }

    if (indice < frases.length - 1) {
        indice++;
        mostrarFrase();
    } else {
        estado = "concluido";
        frase.textContent = "Atividade concluída!";
        progresso.textContent = "Concluída";
        progressBar.style.width = "100%";
        definirStatus("Todas as suas frases foram enviadas.", "success");

        botaoGravar.hidden = true;
        botaoProxima.hidden = true;
        resultado.hidden = true;
    }
}


botaoGravar.addEventListener("click", alternarGravacao);
botaoTentarNovamente.addEventListener("click", tentarNovamente);
botaoConfirmar.addEventListener("click", confirmarResposta);
botaoProxima.addEventListener("click", proximaFrase);

carregarFrases().catch(erro => {
    console.error(erro);
    estado = "erro";
    definirStatus(erro.message || "Erro ao carregar a atividade.", "error");
    frase.textContent = "Erro ao carregar a atividade.";
});
