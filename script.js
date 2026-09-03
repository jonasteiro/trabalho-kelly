/* ---------- dados fixos ---------- */
const PROCESSO_AUDITADO = "Recebimento e Armazenagem de Matéria-Prima";

const CHECKLIST_TEMPLATE = [
  {id:1, cat:"Documentação e registros", text:"Existe procedimento documentado para o processo de recebimento?"},
  {id:2, cat:"Documentação e registros", text:"Os registros de inspeção são preenchidos e arquivados corretamente?"},
  {id:3, cat:"Documentação e registros", text:"As não conformidades de auditorias anteriores foram tratadas e encerradas?"},
  {id:4, cat:"Conformidade do material", text:"O material recebido corresponde às especificações do pedido de compra?"},
  {id:5, cat:"Conformidade do material", text:"As amostras são coletadas conforme o plano de amostragem definido?"},
  {id:6, cat:"Conformidade do material", text:"Os itens não conformes são identificados e segregados imediatamente?"},
  {id:7, cat:"Infraestrutura e armazenagem", text:"A área de armazenagem está limpa, organizada e sinalizada?"},
  {id:8, cat:"Infraestrutura e armazenagem", text:"As condições ambientais (temperatura/umidade) são monitoradas quando aplicável?"},
  {id:9, cat:"Infraestrutura e armazenagem", text:"Os rótulos e identificações dos materiais estão legíveis e atualizados?"},
  {id:10, cat:"Segurança e pessoas", text:"Os colaboradores possuem treinamento atualizado para a função?"},
  {id:11, cat:"Segurança e pessoas", text:"Os EPIs adequados estão sendo utilizados corretamente?"},
  {id:12, cat:"Segurança e pessoas", text:"Os indicadores de desempenho do processo são acompanhados e analisados?"}
];

const ESCALATION_LEVELS = ["Responsável do processo", "Supervisor / Coordenador", "Gerência", "Diretoria"];
const SEVERITY_SLA = {"Crítica":2, "Maior":5, "Menor":10};

/* ---------- estado ---------- */
let STATE = { audits: [], ncs: [], comms: [], tab: "dashboard" };
let ncCounter = 1;

/* ---------- persistência ---------- */
async function loadKey(key){
  try{
    const r = await window.storage.get(key, false);
    return r ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveKey(key, val){
  try{ await window.storage.set(key, JSON.stringify(val), false); }catch(e){ console.error("storage error", e); }
}
async function initApp(){
  STATE.audits = await loadKey("qms_audits");
  STATE.ncs = await loadKey("qms_ncs");
  STATE.comms = await loadKey("qms_comms");
  ncCounter = STATE.ncs.length ? Math.max(...STATE.ncs.map(n=>n.seq||0))+1 : 1;
  checkEscalations(false);
  bindNav();
  render();
}

/* ---------- utilidades ---------- */
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(dateStr, days){
  const d = new Date(dateStr+"T00:00:00");
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
function fmtDate(d){
  if(!d) return "—";
  const [y,m,day] = d.split("-");
  return day+"/"+m+"/"+y;
}
function fmtDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>{ t.style.display="none"; }, 3800);
}

/* ---------- escalonamento automático ---------- */
function checkEscalations(doRender){
  const today = todayISO();
  let changed = false;
  STATE.ncs.forEach(nc=>{
    if(nc.status === "Resolvida") return;
    if(nc.dueDate && today > nc.dueDate && nc.level < ESCALATION_LEVELS.length-1){
      nc.level += 1;
      nc.status = "Escalonada";
      const extra = Math.max(2, Math.round((SEVERITY_SLA[nc.severity]||5)/2));
      nc.dueDate = addDays(today, extra);
      nc.history.push({date:new Date().toISOString(), action:`Escalonamento automático por atraso — novo responsável: ${ESCALATION_LEVELS[nc.level]}. Novo prazo: ${fmtDate(nc.dueDate)}.`});
      STATE.comms.push({
        id:"COM-"+Date.now()+"-"+nc.id,
        ncId:nc.id,
        channel:"Sistema (automático)",
        recipient:ESCALATION_LEVELS[nc.level],
        subject:`[Escalonamento] Não conformidade ${nc.id} em atraso`,
        message:buildCommMessage(nc, true),
        sentAt:new Date().toISOString(),
        auto:true
      });
      changed = true;
    }
  });
  if(changed){
    saveKey("qms_ncs", STATE.ncs);
    saveKey("qms_comms", STATE.comms);
    if(doRender!==false) render();
  }
}

/* ---------- navegação ---------- */
function bindNav(){
  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      STATE.tab = btn.dataset.tab;
      render();
    });
  });
}

/* ---------- render principal ---------- */
function render(){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.tab===STATE.tab));
  const openCount = STATE.ncs.filter(n=>n.status!=="Resolvida").length;
  const badge = document.getElementById("ncBadge");
  if(openCount>0){ badge.style.display="inline-block"; badge.textContent = openCount; } else { badge.style.display="none"; }

  const content = document.getElementById("content");
  if(STATE.tab==="dashboard") content.innerHTML = renderDashboard();
  else if(STATE.tab==="checklist") content.innerHTML = renderChecklist();
  else if(STATE.tab==="ncs") content.innerHTML = renderNCs();
  else if(STATE.tab==="comms") content.innerHTML = renderComms();

  if(STATE.tab==="checklist") bindChecklistEvents();
  if(STATE.tab==="ncs") bindNcEvents();
  if(STATE.tab==="comms") bindCommsEvents();
}

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  const lastAudit = STATE.audits[STATE.audits.length-1];
  const adherence = lastAudit ? lastAudit.adherence : null;
  const open = STATE.ncs.filter(n=>n.status==="Aberta").length;
  const escal = STATE.ncs.filter(n=>n.status==="Escalonada").length;
  const resolved = STATE.ncs.filter(n=>n.status==="Resolvida").length;
  const today = todayISO();
  const overdue = STATE.ncs.filter(n=>n.status!=="Resolvida" && n.dueDate && n.dueDate < today);

  const recent = STATE.audits.slice(-8);
  const bars = recent.length ? recent.map(a=>`
    <div class="bar-wrap">
      <div class="v">${a.adherence}%</div>
      <div class="bar" style="height:${Math.max(4,a.adherence)}%"></div>
      <div class="d">${fmtDate(a.date)}</div>
    </div>`).join("") : "";

  return `
    <h2 class="page-title">Painel de qualidade</h2>
    <p class="page-sub">Visão geral das auditorias realizadas e das não conformidades em andamento no processo de ${PROCESSO_AUDITADO.toLowerCase()}.</p>

    <div class="grid cols-4">
      <div class="card stat accent"><div class="num">${adherence!==null ? adherence+"%" : "—"}</div><div class="label">Aderência da última auditoria</div></div>
      <div class="card stat bad"><div class="num">${open}</div><div class="label">Não conformidades abertas</div></div>
      <div class="card stat accent"><div class="num">${escal}</div><div class="label">Escalonadas</div></div>
      <div class="card stat ok"><div class="num">${resolved}</div><div class="label">Resolvidas</div></div>
    </div>

    <div class="section-title">Histórico de aderência (últimas auditorias)</div>
    <div class="card">
      ${recent.length ? `<div class="bars">${bars}</div>` : `<div class="empty">Nenhuma auditoria registrada ainda. Vá em "Nova auditoria" para começar.</div>`}
    </div>

    <div class="section-title">Não conformidades em atraso</div>
    ${overdue.length ? overdue.map(n=>`
      <div class="alert-row">
        <span>${n.id} — ${n.itemText}</span>
        <span class="a-right">venceu em ${fmtDate(n.dueDate)} · nível: ${ESCALATION_LEVELS[n.level]}</span>
      </div>`).join("") : `<div class="empty">Nenhuma não conformidade em atraso no momento.</div>`}
  `;
}

/* ---------- CHECKLIST ---------- */
function renderChecklist(){
  const grouped = {};
  CHECKLIST_TEMPLATE.forEach(it=>{ (grouped[it.cat] ||= []).push(it); });

  let itemsHtml = "";
  Object.keys(grouped).forEach(cat=>{
    itemsHtml += `<div class="checklist-cat">${cat}</div>`;
    grouped[cat].forEach(it=>{
      itemsHtml += `
      <div class="item" data-item="${it.id}">
        <div class="qhead">
          <div class="qnum">${String(it.id).padStart(2,"0")}</div>
          <div class="qtext">${it.text}</div>
        </div>
        <div class="status-group">
          <div class="status-opt c"><input type="radio" name="status_${it.id}" id="c_${it.id}" value="C" onchange="onItemStatusChange(${it.id})"><label for="c_${it.id}">Conforme</label></div>
          <div class="status-opt nc"><input type="radio" name="status_${it.id}" id="nc_${it.id}" value="NC" onchange="onItemStatusChange(${it.id})"><label for="nc_${it.id}">Não conforme</label></div>
          <div class="status-opt na"><input type="radio" name="status_${it.id}" id="na_${it.id}" value="NA" onchange="onItemStatusChange(${it.id})"><label for="na_${it.id}">Não se aplica</label></div>
        </div>
        <div class="nc-extra" id="extra_${it.id}">
          <div class="field"><label>Descrição da não conformidade (evidência observada)</label><textarea id="desc_${it.id}" placeholder="O que foi observado durante a auditoria..."></textarea></div>
          <div class="row-3">
            <div class="field"><label>Severidade</label>
              <select id="sev_${it.id}" onchange="onSeverityChange(${it.id})">
                <option value="Menor">Menor</option>
                <option value="Maior">Maior</option>
                <option value="Crítica">Crítica</option>
              </select>
            </div>
            <div class="field"><label>Responsável pela correção</label><input type="text" id="resp_${it.id}" placeholder="Nome ou área"></div>
            <div class="field"><label>Prazo para resolução</label><input type="date" id="due_${it.id}"></div>
          </div>
        </div>
      </div>`;
    });
  });

  return `
    <h2 class="page-title">Nova auditoria</h2>
    <p class="page-sub">Processo auditado: <b style="color:var(--text)">${PROCESSO_AUDITADO}</b>. Para cada item, marque a situação encontrada. Itens marcados como "Não conforme" abrem automaticamente um registro de não conformidade ao salvar.</p>

    <div class="row-3">
      <div class="field"><label>Auditor(a)</label><input type="text" id="auditorName" placeholder="Nome de quem está auditando"></div>
      <div class="field"><label>Data da auditoria</label><input type="date" id="auditDate" value="${todayISO()}"></div>
      <div class="field"><label>Área / turno (opcional)</label><input type="text" id="auditArea" placeholder="Ex.: Turno A, Doca 2"></div>
    </div>

    <div id="itemsWrap">${itemsHtml}</div>

    <div class="form-actions">
      <button class="btn secondary" onclick="resetChecklistForm()">Limpar</button>
      <button class="btn" onclick="submitAudit()">Salvar auditoria</button>
    </div>
  `;
}

function onItemStatusChange(id){
  const val = document.querySelector(`input[name="status_${id}"]:checked`).value;
  const extra = document.getElementById("extra_"+id);
  extra.classList.toggle("show", val==="NC");
  if(val==="NC"){
    onSeverityChange(id);
  }
}
function onSeverityChange(id){
  const sev = document.getElementById("sev_"+id).value;
  const dueInput = document.getElementById("due_"+id);
  if(!dueInput.value || dueInput.dataset.auto==="1"){
    dueInput.value = addDays(todayISO(), SEVERITY_SLA[sev]);
    dueInput.dataset.auto = "1";
  }
}
function resetChecklistForm(){ render(); }

function submitAudit(){
  const auditor = document.getElementById("auditorName").value.trim();
  const date = document.getElementById("auditDate").value || todayISO();
  const area = document.getElementById("auditArea").value.trim();

  if(!auditor){ showToast("Informe o nome do auditor antes de salvar."); return; }

  let conforme=0, naoConforme=0, na=0;
  const answers = [];
  const newNcs = [];

  CHECKLIST_TEMPLATE.forEach(it=>{
    const checked = document.querySelector(`input[name="status_${it.id}"]:checked`);
    const status = checked ? checked.value : null;
    if(!status){ na++; answers.push({id:it.id, text:it.text, status:"NA"}); return; }
    answers.push({id:it.id, text:it.text, status});
    if(status==="C") conforme++;
    else if(status==="NA") na++;
    else if(status==="NC"){
      naoConforme++;
      const sev = document.getElementById("sev_"+it.id).value;
      const resp = document.getElementById("resp_"+it.id).value.trim() || "Não definido";
      const due = document.getElementById("due_"+it.id).value || addDays(date, SEVERITY_SLA[sev]);
      const desc = document.getElementById("desc_"+it.id).value.trim() || "Sem descrição adicional.";
      const ncId = "NC-"+String(ncCounter).padStart(3,"0");
      newNcs.push({
        id: ncId, seq: ncCounter,
        itemId: it.id, itemText: it.text, category: it.cat,
        description: desc, severity: sev, responsible: resp,
        dueDate: due, status: "Aberta", level: 0,
        createdAt: new Date().toISOString(),
        history: [{date:new Date().toISOString(), action:`Não conformidade aberta durante auditoria por ${auditor}.`}]
      });
      ncCounter++;
    }
  });

  const aplicaveis = conforme + naoConforme;
  const adherence = aplicaveis ? Math.round((conforme/aplicaveis)*100) : 0;

  const audit = {
    id:"AUD-"+Date.now(), auditor, date, area,
    answers, conforme, naoConforme, na, adherence
  };

  STATE.audits.push(audit);
  STATE.ncs.push(...newNcs);
  saveKey("qms_audits", STATE.audits);
  saveKey("qms_ncs", STATE.ncs);

  showToast(`Auditoria salva — aderência de ${adherence}%. ${newNcs.length} não conformidade(s) registrada(s).`);
  STATE.tab = newNcs.length ? "ncs" : "dashboard";
  render();
}

/* ---------- NÃO CONFORMIDADES ---------- */
let ncFilter = "todas";
function renderNCs(){
  checkEscalations(false);
  const today = todayISO();
  let list = STATE.ncs.slice().sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
  if(ncFilter==="abertas") list = list.filter(n=>n.status!=="Resolvida");
  if(ncFilter==="escalonadas") list = list.filter(n=>n.status==="Escalonada");
  if(ncFilter==="resolvidas") list = list.filter(n=>n.status==="Resolvida");
  if(ncFilter==="atraso") list = list.filter(n=>n.status!=="Resolvida" && n.dueDate < today);

  const cards = list.map(n=>{
    const overdue = n.status!=="Resolvida" && n.dueDate < today;
    const statusClass = "status-"+n.status.replace(" ","");
    return `
    <div class="nc-card ${overdue?"overdue":""}">
      <div class="nc-top">
        <div>
          <div class="nc-id">${n.id} · ${n.category}</div>
          <div class="nc-title">${n.itemText}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span class="badge sev-${n.severity}">${n.severity}</span>
          <span class="badge ${statusClass}">${n.status}</span>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-dim);margin-top:6px;">${n.description}</div>
      <div class="nc-meta">
        <span>Responsável: <b>${n.responsible}</b></span>
        <span>Nível atual: <b>${ESCALATION_LEVELS[n.level]}</b></span>
        <span>Prazo: <b style="color:${overdue?'var(--bad)':'var(--text)'}">${fmtDate(n.dueDate)}</b></span>
        <span>Aberta em: <b>${fmtDate(n.createdAt.slice(0,10))}</b></span>
      </div>
      <div class="nc-actions">
        ${n.status!=="Resolvida" ? `<button class="btn small" onclick="toggleResolve('${n.id}')">Marcar como resolvida</button>` : ""}
        ${n.status!=="Resolvida" && n.level < ESCALATION_LEVELS.length-1 ? `<button class="btn small secondary" onclick="escalateManually('${n.id}')">Escalonar agora</button>` : ""}
        <button class="btn small secondary" onclick="toggleHistory('${n.id}')">Ver histórico</button>
      </div>
      <div class="resolve-box" id="resolve_${n.id}">
        <textarea id="resnote_${n.id}" placeholder="Descreva a ação corretiva aplicada e a evidência de resolução..."></textarea>
        <button class="btn small" onclick="confirmResolve('${n.id}')">Confirmar</button>
      </div>
      <div class="history" id="hist_${n.id}">
        ${n.history.map(h=>`<div class="h-entry"><span class="h-date">${fmtDateTime(h.date)}</span>${h.action}</div>`).join("")}
      </div>
    </div>`;
  }).join("");

  return `
    <h2 class="page-title">Não conformidades</h2>
    <p class="page-sub">Acompanhamento das não conformidades até a resolução. Itens vencidos são escalonados automaticamente para o próximo nível de responsabilidade.</p>
    <div class="filters">
      <button class="${ncFilter==='todas'?'active':''}" onclick="setNcFilter('todas')">Todas (${STATE.ncs.length})</button>
      <button class="${ncFilter==='abertas'?'active':''}" onclick="setNcFilter('abertas')">Em aberto (${STATE.ncs.filter(n=>n.status!=='Resolvida').length})</button>
      <button class="${ncFilter==='escalonadas'?'active':''}" onclick="setNcFilter('escalonadas')">Escalonadas (${STATE.ncs.filter(n=>n.status==='Escalonada').length})</button>
      <button class="${ncFilter==='atraso'?'active':''}" onclick="setNcFilter('atraso')">Em atraso (${STATE.ncs.filter(n=>n.status!=='Resolvida'&&n.dueDate<today).length})</button>
      <button class="${ncFilter==='resolvidas'?'active':''}" onclick="setNcFilter('resolvidas')">Resolvidas (${STATE.ncs.filter(n=>n.status==='Resolvida').length})</button>
    </div>
    ${cards || `<div class="empty">Nenhuma não conformidade nessa categoria.</div>`}
  `;
}
function setNcFilter(f){ ncFilter=f; render(); }
function bindNcEvents(){}
function toggleHistory(id){ document.getElementById("hist_"+id).classList.toggle("show"); }
function toggleResolve(id){ document.getElementById("resolve_"+id).classList.toggle("show"); }
function confirmResolve(id){
  const note = document.getElementById("resnote_"+id).value.trim();
  if(!note){ showToast("Descreva a ação corretiva antes de confirmar."); return; }
  const nc = STATE.ncs.find(n=>n.id===id);
  nc.status = "Resolvida";
  nc.closedAt = new Date().toISOString();
  nc.history.push({date:new Date().toISOString(), action:`Não conformidade resolvida. Ação corretiva: ${note}`});
  saveKey("qms_ncs", STATE.ncs);
  showToast(`${id} marcada como resolvida.`);
  render();
}
function escalateManually(id){
  const nc = STATE.ncs.find(n=>n.id===id);
  if(nc.level >= ESCALATION_LEVELS.length-1) return;
  nc.level += 1;
  nc.status = "Escalonada";
  nc.history.push({date:new Date().toISOString(), action:`Escalonamento manual — novo responsável: ${ESCALATION_LEVELS[nc.level]}.`});
  saveKey("qms_ncs", STATE.ncs);
  showToast(`${id} escalonada para ${ESCALATION_LEVELS[nc.level]}.`);
  render();
}

/* ---------- COMUNICAÇÃO ---------- */
function buildCommMessage(nc, isAuto){
  return `Assunto: Não conformidade ${nc.id} — ${nc.severity}

Para: ${ESCALATION_LEVELS[nc.level]}${isAuto ? " (escalonamento automático por atraso)" : ""}
Responsável designado: ${nc.responsible}

Processo: ${PROCESSO_AUDITADO}
Item auditado: ${nc.itemText}
Categoria: ${nc.category}

Descrição da não conformidade:
${nc.description}

Severidade: ${nc.severity}
Status atual: ${nc.status}
Prazo para resolução: ${fmtDate(nc.dueDate)}
Nível de escalonamento: ${ESCALATION_LEVELS[nc.level]}

Solicitamos ação corretiva dentro do prazo definido. O andamento pode ser acompanhado no sistema de auditoria.`;
}

function renderComms(){
  const openNcs = STATE.ncs.filter(n=>n.status!=="Resolvida");
  const options = openNcs.map(n=>`<option value="${n.id}">${n.id} — ${n.itemText.slice(0,50)}${n.itemText.length>50?"...":""}</option>`).join("");
  const log = STATE.comms.slice().sort((a,b)=> new Date(b.sentAt)-new Date(a.sentAt));

  return `
    <h2 class="page-title">Comunicação de não conformidades</h2>
    <p class="page-sub">Gere e registre a comunicação formal de uma não conformidade para o responsável ou para o nível de escalonamento atual.</p>

    <div class="grid cols-2">
      <div class="card">
        <div class="field"><label>Não conformidade</label>
          <select id="commNcSelect" onchange="updateCommPreview()">
            <option value="">Selecione...</option>
            ${options}
          </select>
        </div>
        <div class="row-3" style="grid-template-columns:1fr 1fr;">
          <div class="field"><label>Canal</label>
            <select id="commChannel"><option>E-mail</option><option>Reunião de qualidade</option><option>Sistema interno</option><option>Mensagem instantânea</option></select>
          </div>
          <div class="field"><label>Destinatário</label><input type="text" id="commRecipient" placeholder="Preenchido automaticamente"></div>
        </div>
        <button class="btn" onclick="registerComm()">Registrar comunicação</button>
      </div>
      <div class="card">
        <div class="field" style="margin-bottom:8px;"><label>Prévia da mensagem</label></div>
        <div class="comm-preview" id="commPreview">Selecione uma não conformidade para gerar a mensagem.</div>
      </div>
    </div>

    <div class="section-title">Histórico de comunicações</div>
    <div class="card">
      ${log.length ? log.map(c=>`
        <div class="comm-log-item">
          <div class="clh"><span>${c.ncId} · ${c.channel} → ${c.recipient}</span><span>${fmtDateTime(c.sentAt)}</span></div>
          <div>${c.subject}</div>
        </div>`).join("") : `<div class="empty">Nenhuma comunicação registrada ainda.</div>`}
    </div>
  `;
}
function bindCommsEvents(){}
function updateCommPreview(){
  const id = document.getElementById("commNcSelect").value;
  const preview = document.getElementById("commPreview");
  const recipientField = document.getElementById("commRecipient");
  if(!id){ preview.textContent = "Selecione uma não conformidade para gerar a mensagem."; recipientField.value=""; return; }
  const nc = STATE.ncs.find(n=>n.id===id);
  preview.textContent = buildCommMessage(nc, false);
  recipientField.value = ESCALATION_LEVELS[nc.level];
}
function registerComm(){
  const id = document.getElementById("commNcSelect").value;
  if(!id){ showToast("Selecione uma não conformidade."); return; }
  const nc = STATE.ncs.find(n=>n.id===id);
  const channel = document.getElementById("commChannel").value;
  const recipient = document.getElementById("commRecipient").value.trim() || ESCALATION_LEVELS[nc.level];
  const comm = {
    id:"COM-"+Date.now(), ncId:id, channel, recipient,
    subject:`Não conformidade ${id} — ${nc.severity}`,
    message: buildCommMessage(nc, false),
    sentAt: new Date().toISOString(), auto:false
  };
  STATE.comms.push(comm);
  nc.history.push({date:new Date().toISOString(), action:`Comunicação registrada via ${channel} para ${recipient}.`});
  saveKey("qms_comms", STATE.comms);
  saveKey("qms_ncs", STATE.ncs);
  showToast("Comunicação registrada.");
  render();
}
function bindChecklistEvents(){}

/* ---------- start ---------- */
initApp();