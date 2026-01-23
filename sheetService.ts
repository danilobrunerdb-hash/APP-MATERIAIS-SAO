
import { Movement } from './types';

/**
 * =================================================================================
 * INSTRUÇÕES OBRIGATÓRIAS PARA ATUALIZAR O SCRIPT (GOOGLE APPS SCRIPT)
 * =================================================================================
 * 
 * 1. Copie TODO o código que está dentro do bloco "CÓDIGO PARA COPIAR" abaixo.
 * 2. Vá na sua planilha > Extensões > Apps Script.
 * 3. Apague tudo lá e cole este código novo.
 * 
 * --- PASSO CRÍTICO (AUTORIZAÇÃO) ---
 * 4. Mude a função de execução para "AUTORIZAR_PERMISSOES".
 * 5. Clique em "Executar". O Google pedirá permissão para acessar o DRIVE e EMAIL.
 *    - Conceda todas as permissões (Avançado > Acessar... > Permitir).
 * 
 * --- PASSO FINAL (IMPLANTAÇÃO) ---
 * 6. Clique em "Implantar" > "Gerenciar implantações".
 * 7. Clique no ícone de lápis (Editar) na versão ativa.
 * 8. EM "VERSÃO", SELECIONE "NOVA VERSÃO". (Isso é obrigatório para o código novo funcionar).
 * 9. Clique em "Implantar".
 * 
 * CÓDIGO PARA COPIAR:
 * ---------------------------------------------------------------------------------
 * 
 * function AUTORIZAR_PERMISSOES() {
 *   var email = Session.getActiveUser().getEmail();
 *   console.log("Autorizando: " + email);
 *   MailApp.getRemainingDailyQuota(); 
 *   DriveApp.getRootFolder(); // Força permissão do Drive
 * }
 * 
 * function getOrCreateFolder(folderName) {
 *   var folders = DriveApp.getFoldersByName(folderName);
 *   var folder;
 *   if (folders.hasNext()) {
 *     folder = folders.next();
 *   } else {
 *     folder = DriveApp.createFolder(folderName);
 *   }
 *   
 *   // Tenta definir a pasta como pública para garantir que os arquivos dentro herdem a visibilidade
 *   try {
 *     folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
 *   } catch(e) {
 *     console.log("Aviso: Não foi possível definir permissão pública na pasta (pode ser restrição de domínio).");
 *   }
 *   return folder;
 * }
 * 
 * function doPost(e) {
 *   var lock = LockService.getScriptLock();
 *   try {
 *     lock.tryLock(30000); // Aumentado tempo de lock para upload
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
 *       try {
 *         MailApp.sendEmail({
 *           to: data.to,
 *           subject: data.subject,
 *           body: data.body,
 *           noReply: true,
 *           name: "SAO - 6º BBM"
 *         });
 *         return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
 *       } catch (emailErr) {
 *         return ContentService.createTextOutput("EmailError: " + emailErr.toString()).setMimeType(ContentService.MimeType.TEXT);
 *       }
 *     }
 *     
 *     // --- AÇÃO: SALVAR DADOS ---
 *     if (data.action === 'save' && data.movements && Array.isArray(data.movements)) {
 *       
 *       // Pasta onde as fotos serão salvas
 *       var folder = getOrCreateFolder("SAO_IMAGENS_SISTEMA");
 *       
 *       sheet.clear(); 
 *       
 *       var headers = [
 *         "ID", "BM", "Nome", "Nome Guerra", "Posto", 
 *         "Material", "Categoria", "Origem", "Data Saída", "Previsão", "Motivo", 
 *         "Status", "Data Retorno", "Obs", "Recebedor BM", "Recebedor Nome", 
 *         "Recebedor Guerra", "Recebedor Posto", "Plantonista BM", "Plantonista Nome", "Plantonista do Dia", "Foto"
 *       ];
 *       sheet.appendRow(headers);
 *       sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
 *       
 *       if (data.movements.length > 0) {
 *         var rows = data.movements.map(function(m) {
 *           var plantonistaResumo = m.dutyOfficerName ? m.dutyOfficerName + " (" + m.dutyOfficerBm + ")" : "";
 *           var origemTratada = (m.origin && m.origin.toString().trim() !== "") ? m.origin : "SAO";
 *           
 *           // TRATAMENTO DE IMAGEM (UPLOAD PRO DRIVE)
 *           var imageUrl = m.image || '';
 *           
 *           // Se a string começar com "data:image", é um base64 novo que precisa subir
 *           if (imageUrl.toString().indexOf('data:image') === 0) {
 *             try {
 *               var base64Data = imageUrl.split(',')[1];
 *               var decoded = Utilities.base64Decode(base64Data);
 *               var blob = Utilities.newBlob(decoded, 'image/jpeg', 'foto_' + m.id + '.jpg');
 *               var file = folder.createFile(blob);
 *               
 *               // Tenta ajustar permissão (pode falhar em domínios corporativos restritos)
 *               try {
 *                 file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
 *               } catch (ePerm) {
 *                 console.log("Alerta de Permissão no Arquivo: " + ePerm.toString()); 
 *               }
 *               
 *               // CORREÇÃO: Link direto de visualização
 *               imageUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
 * 
 *             } catch (errImg) {
 *               // Grava o erro real na célula para debug
 *               imageUrl = "Erro: " + errImg.toString();
 *             }
 *           }
 *           // Se já for uma URL (http...), mantém como está
 *           
 *           return [
 *             m.id, m.bm, m.name, m.warName, m.rank,
 *             m.material, m.type, origemTratada, 
 *             m.dateCheckout, m.estimatedReturnDate || '', m.reason || '',
 *             m.status, m.dateReturn || '', m.observations || '', 
 *             m.receiverBm || '', m.receiverName || '', m.receiverWarName || '', m.receiverRank || '', 
 *             m.dutyOfficerBm || '', m.dutyOfficerName || '', plantonistaResumo, imageUrl
 *           ];
 *         });
 *         
 *         // Grava em lotes
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
 *           receiverRank: String(row[17]), dutyOfficerBm: String(row[18] || ''), dutyOfficerName: String(row[19] || ''), image: String(row[21] || '')
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
