
import { Movement } from './types';

export const saveToSheets = async (url: string, movements: Movement[]) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // Necessário para Google Apps Script web apps
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', movements })
    });
    return true;
  } catch (error) {
    console.error("Erro ao salvar na planilha:", error);
    return false;
  }
};

export const fetchFromSheets = async (url: string): Promise<Movement[] | null> => {
  try {
    const response = await fetch(`${url}?action=read`);
    if (!response.ok) throw new Error("Erro na resposta");
    const data = await response.json();
    return data as Movement[];
  } catch (error) {
    console.error("Erro ao buscar da planilha:", error);
    return null;
  }
};
