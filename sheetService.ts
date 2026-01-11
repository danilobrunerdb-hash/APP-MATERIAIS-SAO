
import { Movement } from './types';

/**
 * INSTRUÇÕES PARA O BACKEND (GOOGLE SHEETS) - V2 ROBUSTA:
 * 1. Abra sua planilha do Google.
 * 2. Vá em Extensões > Apps Script.
 * 3. Apague tudo e cole o código abaixo exatamente:
 * 
 * function doPost(e) {
 *   var data = JSON.parse(e.postData.contents);
 *   var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *   
 *   if (data.action === 'save') {
 *     sheet.clearContents();
 *     // Cabeçalho da Planilha
 *     sheet.appendRow(["ID", "BM", "Nome", "Posto", "Material", "Data Saída", "Previsão", "Status", "Data Retorno", "Recebedor", "Obs", "Motivo"]);
 *     
 *     data.movements.forEach(function(m) {
 *       sheet.appendRow([
 *         m.id, 
 *         m.bm, 
 *         m.name, 
 *         m.rank, 
 *         m.material, 
 *         m.dateCheckout, 
 *         m.estimatedReturnDate || '', 
 *         m.status, 
 *         m.dateReturn || '', 
 *         m.receiverWarName || '', 
 *         m.observations || '',
 *         m.reason || ''
 *       ]);
 *     });
 *     return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
 *   }
 * }
 * 
 * function doGet(e) {
 *   var action = e.parameter.action;
 *   var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *   var values = sheet.getDataRange().getValues();
 *   
 *   if (action === 'read') {
 *     var results = [];
 *     for (var i = 1; i < values.length; i++) {
 *       results.push({
 *         id: String(values[i][0]),
 *         bm: String(values[i][1]),
 *         name: String(values[i][2]),
 *         rank: String(values[i][3]),
 *         material: String(values[i][4]),
 *         dateCheckout: String(values[i][5]),
 *         estimatedReturnDate: String(values[i][6]),
 *         status: String(values[i][7]),
 *         dateReturn: String(values[i][8]),
 *         receiverWarName: String(values[i][9]),
 *         observations: String(values[i][10]),
 *         reason: String(values[i][11] || 'TPB')
 *       });
 *     }
 *     return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
 *   }
 *   return ContentService.createTextOutput("Invalid Action").setMimeType(ContentService.MimeType.TEXT);
 * }
 * 
 * 4. Clique em "Implantar" > "Nova Implantação".
 * 5. Selecione "App da Web", "Executar como: Eu" e "Quem pode acessar: Qualquer um".
 * 6. Copie a URL e cole nas configurações (engrenagem) do app.
 */

export const saveToSheets = async (url: string, movements: Movement[]) => {
  if (!url || !url.includes("exec")) return false;
  
  try {
    // Usamos o modo 'no-cors' para evitar problemas de preflight se o GAS não estiver perfeito,
    // mas POST com JSON exige que o GAS esteja configurado como App da Web.
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Importante para Google Apps Script
      body: JSON.stringify({ action: 'save', movements }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
    return true; 
  } catch (error) {
    console.error("Sync Error (Save):", error);
    return false;
  }
};

export const fetchFromSheets = async (url: string): Promise<Movement[] | null> => {
  if (!url || !url.includes("exec")) return null;
  
  try {
    // Cache busting com timestamp
    const response = await fetch(`${url}?action=read&t=${Date.now()}`);
    if (!response.ok) throw new Error("Network Response Fail");
    const data = await response.json();
    return data as Movement[];
  } catch (error) {
    console.error("Sync Error (Fetch):", error);
    return null;
  }
};
