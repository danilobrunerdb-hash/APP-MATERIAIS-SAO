
import { Movement } from './types';

/**
 * INSTRUÇÕES PARA O GOOGLE APPS SCRIPT (GAS) - VERSÃO DE ALTA FIDELIDADE:
 * 
 * 1. No Google Sheets, vá em Extensões > Apps Script.
 * 2. Substitua TODO o código lá por este abaixo:
 * 
 * function doPost(e) {
 *   try {
 *     var data = JSON.parse(e.postData.contents);
 *     var ss = SpreadsheetApp.getActiveSpreadsheet();
 *     var sheet = ss.getActiveSheet();
 *     
 *     if (data.action === 'save' && data.movements && Array.isArray(data.movements)) {
 *       sheet.clear(); // Limpa para evitar duplicidade ou lixo
 *       var headers = [
 *         "ID", "BM", "Nome", "Nome Guerra", "Posto", 
 *         "Material", "Categoria", "Data Saída", "Previsão", "Motivo", 
 *         "Status", "Data Retorno", "Obs", "Recebedor BM", "Recebedor Nome", 
 *         "Recebedor Guerra", "Recebedor Posto"
 *       ];
 *       sheet.appendRow(headers);
 *       
 *       if (data.movements.length > 0) {
 *         var rows = data.movements.map(function(m) {
 *           return [
 *             m.id, m.bm, m.name, m.warName, m.rank,
 *             m.material, m.type, m.dateCheckout, m.estimatedReturnDate || '', m.reason || '',
 *             m.status, m.dateReturn || '', m.observations || '', m.receiverBm || '', m.receiverName || '',
 *             m.receiverWarName || '', m.receiverRank || ''
 *           ];
 *         });
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
 *       for (var i = 1; i < data.length; i++) {
 *         var row = data[i];
 *         if (!row[0]) continue;
 *         results.push({
 *           id: String(row[0]),
 *           bm: String(row[1]),
 *           name: String(row[2]),
 *           warName: String(row[3]),
 *           rank: String(row[4]),
 *           material: String(row[5]),
 *           type: String(row[6]),
 *           dateCheckout: String(row[7]),
 *           estimatedReturnDate: String(row[8]),
 *           reason: String(row[9]),
 *           status: String(row[10]),
 *           dateReturn: String(row[11]),
 *           observations: String(row[12]),
 *           receiverBm: String(row[13]),
 *           receiverName: String(row[14]),
 *           receiverWarName: String(row[15]),
 *           receiverRank: String(row[16])
 *         });
 *       }
 *       return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
 *     }
 *   } catch(err) {
 *     return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
 *   }
 * }
 * 
 * 3. Clique em "Implantar" > "Nova Implantação".
 * 4. Tipo: Web App | Quem pode acessar: "Qualquer um".
 * 5. Copie a nova URL gerada e cole nas configurações do aplicativo.
 */

export const saveToSheets = async (url: string, movements: Movement[]) => {
  if (!url || !url.includes("exec")) return false;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'save', movements }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
    return response.ok;
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
