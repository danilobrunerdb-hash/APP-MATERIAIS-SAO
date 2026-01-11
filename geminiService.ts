import { GoogleGenAI } from "@google/genai";
import { Movement } from "./types";

export const getSmartSummary = async (movements: Movement[]) => {
  try {
    // A chave de API é obtida diretamente da variável de ambiente conforme exigido.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const pending = movements.filter(m => m.status === 'PENDENTE');
    
    if (pending.length === 0) {
      return "Não há materiais pendentes para análise no momento. Todos os itens foram devidamente restituídos à reserva da SAO.";
    }

    const today = new Date().toISOString().split('T')[0];
    const context = pending.map(m => {
      const isOverdue = m.estimatedReturnDate && m.estimatedReturnDate < today;
      return `- ${m.rank} ${m.warName} (BM ${m.bm}): ${m.material}. Saída: ${m.dateCheckout.split('T')[0]}. Prev: ${m.estimatedReturnDate || 'N/A'} ${isOverdue ? '[ATRASADO]' : ''}`;
    }).join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analise a seguinte lista de materiais acautelados na SAO do 6º BBM e forneça um resumo executivo de prontidão operacional. 
      Identifique itens críticos (especialmente os atrasados) e sugira ações de controle para o oficial de dia ou encarregado da seção.
      Utilize linguagem militar formal do CBMMG.\n\nLista de Pendências:\n${context}`,
      config: {
        systemInstruction: "Você é o assistente de IA da Seção de Apoio Operacional (SAO) do 6º Batalhão de Bombeiros Militar. Sua função é analisar o inventário e movimentos de materiais, fornecendo relatórios concisos, precisos e em conformidade com o regulamento de correspondência militar. Priorize a segurança operacional e a manutenção da carga.",
      }
    });

    return response.text || "O modelo gerou uma resposta vazia.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro técnico na análise inteligente. Verifique a conexão com o servidor de IA ou as configurações da API.";
  }
};