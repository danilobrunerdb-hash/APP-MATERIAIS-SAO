
import { Movement } from './types';

/**
 * =================================================================================
 * INSTRUÇÕES CRÍTICAS PARA O GOOGLE APPS SCRIPT (GAS):
 * =================================================================================
 * 
 * 1. Abra sua planilha no Google Sheets.
 * 2. Vá em Extensões > Apps Script.
 * 3. Apague todo o código existente lá e cole o código abaixo exatamente como está.
 * 4. Salve o projeto.
 * 5. Clique em "Implantar" > "Nova implantação".
 * 6. Selecione o tipo "App da Web".
 * 7. Em "Descrição", coloque "Versão com Origem".
 * 8. Em "Quem pode acessar", selecione "Qualquer pessoa" (Isso é crucial).
 * 9. Clique em "Implantar" e copie a nova URL gerada (se mudar).
 * 
 * CÓDIGO PARA COPIAR:
 * ---------------------------------------------------------------------------------
 * 
 * function doPost(e) {
 *   try {
 *     var data = JSON.parse(e.postData.contents);
 *     var ss = SpreadsheetApp.getActiveSpreadsheet();
 *     var sheet = ss.getActiveSheet();
 *     
 *     // Se a ação for salvar, reescrevemos a planilha para garantir colunas atualizadas
 *     if (data.action === 'save' && data.movements && Array.isArray(data.movements)) {
 *       sheet.clear(); // Limpa tudo para recriar a estrutura correta com a coluna Origem
 *       
 *       // DEFINIÇÃO DAS COLUNAS (Origem está no índice 7)
 *       var headers = [
 *         "ID", "BM", "Nome", "Nome Guerra", "Posto", 
 *         "Material", "Categoria", "Origem", "Data Saída", "Previsão", "Motivo", 
 *         "Status", "Data Retorno", "Obs", "Recebedor BM", "Recebedor Nome", 
 *         "Recebedor Guerra", "Recebedor Posto", "Plantonista BM", "Plantonista Nome", "Plantonista do Dia"
 *       ];
 *       sheet.appendRow(headers);
 *       
 *       // Formatação do cabeçalho
 *       sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
 *       
 *       if (data.movements.length > 0) {
 *         var rows = data.movements.map(function(m) {
 *           var plantonistaResumo = m.dutyOfficerName ? m.dutyOfficerName + " (" + m.dutyOfficerBm + ")" : "";
 *           
 *           // Garante que a origem tenha um valor. Se vier vazio, assume "SAO"
 *           var origemTratada = (m.origin && m.origin.toString().trim() !== "") ? m.origin : "SAO";
 *           
 *           return [
 *             m.id, 
 *             m.bm, 
 *             m.name, 
 *             m.warName, 
 *             m.rank,
 *             m.material, 
 *             m.type, 
 *             origemTratada, // Aqui preenchemos a coluna Origem
 *             m.dateCheckout, 
 *             m.estimatedReturnDate || '', 
 *             m.reason || '',
 *             m.status, 
 *             m.dateReturn || '', 
 *             m.observations || '', 
 *             m.receiverBm || '', 
 *             m.receiverName || '',
 *             m.receiverWarName || '', 
 *             m.receiverRank || '', 
 *             m.dutyOfficerBm || '', 
 *             m.dutyOfficerName || '',
 *             plantonistaResumo
 *           ];
 *         });
 *         
 *         // Grava todas as linhas de uma vez
 *         sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
 *       }
 *       return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
 *     }
 *   } catch(err) {
 *     return ContentService.createTextOutput("Error: " + err.toString()).setMimeType(ContentService.MimeType.TEXT);
 *   }
 * }
 * 
 * function doGet(e) {
 *   try {
 *     var action = e.parameter.action;
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *     var data = sheet.getDataRange().getValues();
 *     
 *     if (action === 'read') {
 *       if (data.length <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
 *       var results = [];
 *       // Começa do índice 1 para pular o cabeçalho
 *       for (var i = 1; i < data.length; i++) {
 *         var row = data[i];
 *         if (!row[0]) continue; // Pula linhas vazias
 *         
 *         results.push({
 *           id: String(row[0]),
 *           bm: String(row[1]),
 *           name: String(row[2]),
 *           warName: String(row[3]),
 *           rank: String(row[4]),
 *           material: String(row[5]),
 *           type: String(row[6]),
 *           origin: String(row[7] || 'SAO'), // Lê a coluna Origem (índice 7)
 *           dateCheckout: String(row[8]),
 *           estimatedReturnDate: String(row[9]),
 *           reason: String(row[10]),
 *           status: String(row[11]),
 *           dateReturn: String(row[12]),
 *           observations: String(row[13]),
 *           receiverBm: String(row[14]),
 *           receiverName: String(row[15]),
 *           receiverWarName: String(row[16]),
 *           receiverRank: String(row[17]),
 *           dutyOfficerBm: String(row[18] || ''),
 *           dutyOfficerName: String(row[19] || '')
 *         });
 *       }
 *       return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
 *     }
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
