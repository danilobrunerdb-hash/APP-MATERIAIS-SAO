
import { Movement } from './types';

/**
 * =================================================================================
 * INSTRUÇÕES OBRIGATÓRIAS PARA ATIVAR O ENVIO DE E-MAIL (GOOGLE APPS SCRIPT)
 * =================================================================================
 * 
 * 1. Copie TODO o código que está dentro do bloco "CÓDIGO PARA COPIAR" abaixo.
 * 2. Vá na sua planilha > Extensões > Apps Script.
 * 3. Apague tudo lá e cole este código novo.
 * 
 * --- PASSO CRÍTICO (AUTORIZAÇÃO) ---
 * 4. Na barra superior do editor de script, há um menu dropdown com nomes de funções (provavelmente estará "doPost").
 * 5. Mude de "doPost" para "AUTORIZAR_PERMISSOES".
 * 6. Clique no botão "Executar" (ícone de Play) ao lado.
 *    - O Google pedirá permissão. Selecione sua conta.
 *    - Se aparecer "Aplicativo não verificado", clique em "Advanced/Avançado" > "Go to... (unsafe)".
 *    - Clique em "Allow/Permitir".
 *    - Verifique se apareceu "Permissões concedidas" no Log de Execução abaixo.
 * 
 * --- PASSO FINAL (IMPLANTAÇÃO) ---
 * 7. Clique no botão azul "Implantar" (topo direito) > "Gerenciar implantações".
 * 8. Clique no ícone de lápis (Editar) na versão ativa.
 * 9. Em "Versão", abra a lista e selecione "Nova versão". (Se não fizer isso, o código antigo continua rodando).
 * 10. Clique em "Implantar".
 * 
 * CÓDIGO PARA COPIAR:
 * ---------------------------------------------------------------------------------
 * 
 * // Função auxiliar apenas para forçar a janela de permissões do Google
 * function AUTORIZAR_PERMISSOES() {
 *   var email = Session.getActiveUser().getEmail();
 *   console.log("Autorizando envio de emails para: " + email);
 *   MailApp.getRemainingDailyQuota(); // Isso força o pedido de escopo de e-mail
 *   console.log("Permissões concedidas com sucesso.");
 * }
 * 
 * function doPost(e) {
 *   var lock = LockService.getScriptLock();
 *   try {
 *     // Aguarda até 10s para evitar conflitos de salvamento simultâneo
 *     lock.tryLock(10000);
 *     
 *     var data = JSON.parse(e.postData.contents);
 *     var ss = SpreadsheetApp.getActiveSpreadsheet();
 *     var sheet = ss.getActiveSheet();
 *     
 *     // --- AÇÃO: ENVIAR EMAIL ---
 *     if (data.action === 'sendEmail') {
 *       if (!data.to || !data.subject || !data.body) {
 *         return ContentService.createTextOutput("Error: Missing parameters").setMimeType(ContentService.MimeType.TEXT);
 *       }
 *       
 *       try {
 *         MailApp.sendEmail({
 *           to: data.to,
 *           subject: data.subject,
 *           body: data.body,
 *           noReply: true
 *         });
 *         return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
 *       } catch (emailErr) {
 *         // Retorna o erro exato do Google (ex: cota excedida)
 *         return ContentService.createTextOutput("EmailError: " + emailErr.toString()).setMimeType(ContentService.MimeType.TEXT);
 *       }
 *     }
 *     
 *     // --- AÇÃO: SALVAR DADOS ---
 *     if (data.action === 'save' && data.movements && Array.isArray(data.movements)) {
 *       sheet.clear(); 
 *       
 *       var headers = [
 *         "ID", "BM", "Nome", "Nome Guerra", "Posto", 
 *         "Material", "Categoria", "Origem", "Data Saída", "Previsão", "Motivo", 
 *         "Status", "Data Retorno", "Obs", "Recebedor BM", "Recebedor Nome", 
 *         "Recebedor Guerra", "Recebedor Posto", "Plantonista BM", "Plantonista Nome", "Plantonista do Dia"
 *       ];
 *       sheet.appendRow(headers);
 *       sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
 *       
 *       if (data.movements.length > 0) {
 *         var rows = data.movements.map(function(m) {
 *           var plantonistaResumo = m.dutyOfficerName ? m.dutyOfficerName + " (" + m.dutyOfficerBm + ")" : "";
 *           var origemTratada = (m.origin && m.origin.toString().trim() !== "") ? m.origin : "SAO";
 *           
 *           return [
 *             m.id, m.bm, m.name, m.warName, m.rank,
 *             m.material, m.type, origemTratada, 
 *             m.dateCheckout, m.estimatedReturnDate || '', m.reason || '',
 *             m.status, m.dateReturn || '', m.observations || '', 
 *             m.receiverBm || '', m.receiverName || '', m.receiverWarName || '', m.receiverRank || '', 
 *             m.dutyOfficerBm || '', m.dutyOfficerName || '', plantonistaResumo
 *           ];
 *         });
 *         sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
 *       }
 *       return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
 *     }
 *     
 *   } catch(err) {
 *     return ContentService.createTextOutput("Error: " + err.toString()).setMimeType(ContentService.MimeType.TEXT);
 *   } finally {
 *     lock.releaseLock();
 *   }
 * }
 * 
 * function doGet(e) {
 *   try {
 *     var action = e.parameter.action;
 *     
 *     if (action === 'read') {
 *       var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *       var data = sheet.getDataRange().getValues();
 *       if (data.length <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
 *       var results = [];
 *       for (var i = 1; i < data.length; i++) {
 *         var row = data[i];
 *         if (!row[0]) continue;
 *         
 *         results.push({
 *           id: String(row[0]), bm: String(row[1]), name: String(row[2]), warName: String(row[3]), rank: String(row[4]),
 *           material: String(row[5]), type: String(row[6]), origin: String(row[7] || 'SAO'), 
 *           dateCheckout: String(row[8]), estimatedReturnDate: String(row[9]), reason: String(row[10]),
 *           status: String(row[11]), dateReturn: String(row[12]), observations: String(row[13]),
 *           receiverBm: String(row[14]), receiverName: String(row[15]), receiverWarName: String(row[16]), 
 *           receiverRank: String(row[17]), dutyOfficerBm: String(row[18] || ''), dutyOfficerName: String(row[19] || '')
 *         });
 *       }
 *       return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
 *     }
 *     
 *     return ContentService.createTextOutput("Service Operational").setMimeType(ContentService.MimeType.TEXT);
 *   } catch(err) {
 *     return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
 *   }
 * }
 */

export const saveToSheets = async (url: string, movements: Movement[]) => {
  if (!url || !url.includes("exec")) return false;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'save', movements }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
    const text = await response.text();
    return response.ok && text === "Success";
  } catch (error) {
    console.error("Erro ao salvar dados remotos:", error);
    return false;
  }
};

export const fetchFromSheets = async (url: string): Promise<Movement[] | null> => {
  if (!url || !url.includes("exec")) return null;
  
  try {
    const response = await fetch(`${url}?action=read&t=${Date.now()}`);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data : null;
  } catch (error) {
    console.error("Erro ao buscar dados remotos:", error);
    return null;
  }
};

export const sendEmailViaGas = async (url: string, to: string, subject: string, body: string) => {
  if (!url || !url.includes("exec")) return false;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'sendEmail', 
        to, 
        subject, 
        body 
      }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
    
    // Ler a resposta como texto para verificar erros específicos do GAS
    const text = await response.text();
    
    if (response.ok && text === "Success") {
      return true;
    } else {
      console.error("Erro no retorno do GAS:", text);
      return false;
    }
  } catch (error) {
    console.error("Erro de conexão ao enviar email via GAS:", error);
    return false;
  }
};
