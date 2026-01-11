import { GoogleGenAI } from "@google/genai";
import { Movement } from "./types";

export const getSmartSummary = async (movements: Movement[]) => {
  // O Vite substitui esta string pelo valor real configurado no painel do Vercel
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "") {
    console.error("API_KEY não configurada no ambiente.");
    return "Erro: Chave de API não encontrada. Configure a API_KEY nas variáveis de ambiente do Vercel.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const pending = movements.filter(m => m.status === 'PENDENTE');
    
    if (pending.length === 0) return "Não há materiais pendentes para análise no momento.";

    const context = pending.map(m => `${m.name} (${m.rank}) - ${m.material} em ${m.dateCheckout}`).join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analise a seguinte lista de materiais acautelados e forneça um resumo executivo rápido para a Seção de Apoio Operacional (SAO). Liste os itens mais críticos ou quem está com mais materiais pendentes de forma amigável e profissional.\n\n${context}`,
      config: {
        systemInstruction: "Você é o assistente inteligente da Seção de Apoio Operacional (SAO) do 6º Batalhão de Bombeiros Militar do CBMMG. Sua linguagem deve ser técnica, militar, precisa e prestativa.",
      }
    });

    return response.text || "O modelo gerou uma resposta vazia.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Ocorreu um erro ao processar a análise inteligente. Verifique a conexão.";
  }
};