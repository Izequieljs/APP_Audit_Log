import * as pdfjsLib from 'pdfjs-dist';
import { FileData, FileExtractionResult, ExtractedField } from "../types";
import { readFileAsArrayBuffer } from "./utils";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize PDF.js
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            let encoded = reader.result?.toString().replace(/^data:(.*,)?/, '');
            if ((encoded!.length % 4) > 0) {
                encoded += '='.repeat(4 - (encoded!.length % 4));
            }
            resolve(encoded!);
        };
        reader.onerror = error => reject(error);
    });
};

const extractWithGemini = async (file: File, selectedMode: string, fileName: string): Promise<{ fields: ExtractedField[], tokens: number }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const base64 = await fileToBase64(file);
    
    const prompt = `
    You are an expert logistics data extractor. 
    Analyze this scanned document and extract the relevant fields.
    
    The file name is: "${fileName}". 
    Use the suffix after 'VESTAS' in the file name to identify the document type if applicable.

    If it is a Packing List, extract:
    Consignee, Ship-to party, Date, Created by, Shipment no., No. of packages, Order no., Delivery no., Your reference, Gross Weight KG, Net Weight KG, Manufacturer, Country Of Origin.
    For each item in the Packing List, extract:
    - "Item [no] Descrição" (Include all text up to and including the SAP Code)
    - "Item [no] Qtd"
    - "Item [no] UoM"
    
    If it is a Declaração de Importação (DI), extract:
    Número DI, Data Registro, Importador CNPJ, Importador Nome, Adquirente CNPJ, Adquirente Nome, Representante Legal CPF, Representante Legal Nome, Tipo do Manifesto, Número do Manifesto, Recinto Aduaneiro, Armazém, Embalagem, Quantidade, Peso Bruto (Kg), Peso Líquido (Kg), Frete Moeda, Frete Valor, Seguro Moeda, Seguro Valor, VMLE Moeda, VMLE Valor, VMLD Moeda, VMLD Valor, I.I. Suspenso, I.I. Recolhido, I.P.I. Suspenso, I.P.I. Recolhido, Pis/Pasep Suspenso, Pis/Pasep Recolhido, Cofins Suspenso, Cofins Recolhido, Direitos Antidumping Suspenso, Direitos Antidumping Recolhido, Via Transporte.
    IMPORTANT FOR DI: For all tax values (I.I., I.P.I., Pis/Pasep, Cofins, ICMS, etc.), extract the value in Reais that appears AFTER the "R$" symbol, especially in the "Dados Complementares" section.

    If it is a Prestação de Contas (PC), extract:
    Exportador, Via de Transporte, Analista Aeris, Data Chegada, Data Embarque, House, Master, Valor CIF (R$), Valor FOB (R$), Valor Frete (R$), Valor Seguro (R$), Despesa II, Despesa IPI, Despesa PIS, Despesa COFINS, Despesa AFRMM, Taxa SISCOMEX, Serv. Prof. Despachante, Transporte Porto/Fábrica, Frete + Taxas Locais, Desconsolidação, DAE Taxas SEFAZ, Juros e Multa ICMS, Scanner + Levante, Armazenagem, DAPE Serviços, Total Tributos/Contr., Total Geral.
    IMPORTANT FOR PC: The PDF layout often separates the labels (e.g., 'IMPOSTO II', 'IMPOSTO IPI', 'PIS', 'COFINS', 'AFRMM', 'TAXA SISCOMEX') from their corresponding values. The values often appear at the bottom of the page in a separate block under "Pagas pelo Cliente (1)" or "Pagas pela Comissária (2)". You MUST carefully align the values based on their logical vertical order. For example, if the labels are listed vertically, their corresponding values will be listed in the exact same vertical order in the value block below. Do not mix up the values between lines.

    If it is an APM Terminals Invoice, extract:
    Número Nota, Data Emissão, CNPJ Prestador, Base de Cálculo ISS, Valor ISS, Alíquota (%), Valor Total NFS-e, Valor Líquido, ISS Retido. For items: Item [no] Descrição, Item [no] Qtd, Item [no] Valor Unit., Item [no] Valor Total.

    If it is an ICMS / DAE, extract:
    Código Receita, Data Vencimento, Pagamento Até, Nosso Número, Período Referência, Valor Principal, Multa, Juros, Descontos, Valor Total a Recolher, Info Compl. DI, Código de Barras.

    If it is a Nota Fiscal de Serviço (NF) specifically for IMPORTCARGO (NF IMPORT), extract ALL possible fields including:
    Prefeitura, Número da NFS-e, Data e Hora de Emissão, Código de Verificação, RPS, Data Emissão RPS, Razão Social Prestador, Endereço Prestador, CNPJ Prestador, Inscrição Municipal Prestador, Nome Tomador, Endereço Tomador, CPF/CNPJ Tomador, Discriminação dos Serviços (full text), Descrição da Despesa (from discrimination), Valor da Despesa (from discrimination), Processo, Conhecimento, Ref. Cliente, Vencimento, Valor dos Serviços, Valor Líquido, Código do Serviço, Valor Total das Deduções, Base de Cálculo, Alíquota (%), Valor do ISS, Crédito, Outras Informações.

    If the document is a FATURA (e.g., IMPORTCARGO):
    Extract: Fatura Nº, Data da Emissão, Sacado Nome, Sacado CNPJ, Exportador, Processo, Conhecimento, Ref. Cliente.
    For each item in the history: Item [no] Descrição, Item [no] Valor M/E, Item [no] Paridade, Item [no] Valor M/N.
    Totals: Total da Fatura, Total Líquido, Total a Favor.

    If the document is a DAPE (Serviços com Carga Atrelada):
    Extract: Número do Documento, Data de Emissão, Consignatário Nome, Consignatário CNPJ, DI, AWB, HAWB, Termo, Valor da Carga, Peso Mercadoria, Total a Pagar.
    For each service/period: Período [no] Data Vencimento, Período [no] Valor a Pagar.

    If the document is a DANFE (Nota Fiscal Eletrônica):
    Extract: Número, Série, Data de Emissão, Chave de Acesso, Emitente Nome, Emitente CNPJ, Destinatário Nome, Destinatário CNPJ, Valor Total dos Produtos, Valor Total da Nota, Valor do Frete, Valor do Seguro, Desconto, Despesas Acessórias, Valor do IPI.
    For each product: Produto [no] Descrição, Produto [no] NCM, Produto [no] Qtd, Produto [no] Vlr Unit, Produto [no] Vlr Total, Produto [no] Vlr IPI.

    If the document is an AWB (Air Waybill):
    Extract: AWB Number, HAWB, Shipper Name, Consignee Name, Airport of Departure, Airport of Destination, Gross Weight, Chargeable Weight, Total Charge, Nature and Quantity of Goods, Total Collect, Total Prepaid.

    If the document is a GLME (Guia para Liberação de Mercadoria Estrangeira):
    Extract: Importador Nome, Importador CNPJ, Doc. Importação (DI), Data Registro, Valor CIF, Recinto Alfandegado.
    For each item: Item [no] NCM, Item [no] Tratamento Tributário, Item [no] Valor Aduaneiro.

    If it is a general Nota Fiscal de Serviço (NF) (e.g., FRAPORT or others):
    Extract: Número da NFS-e, Data e Hora de Emissão, Código de Verificação, RPS, Razão Social Prestador, CNPJ Prestador, Nome Tomador, CNPJ Tomador, Discriminação dos Serviços, Valor dos Serviços, Base de Cálculo, Alíquota (%), Valor do ISS, Valor Líquido.

    Return the data as a JSON array of objects with 'key' and 'value' string properties.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [
            {
                inlineData: {
                    mimeType: file.type || "application/pdf",
                    data: base64
                }
            },
            prompt
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        key: { type: Type.STRING },
                        value: { type: Type.STRING }
                    },
                    required: ["key", "value"]
                }
            }
        }
    });

    try {
        const jsonStr = response.text || "[]";
        const fields = JSON.parse(jsonStr);
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { fields, tokens };
    } catch (e) {
        console.error("Failed to parse Gemini response", e);
        return { fields: [], tokens: 0 };
    }
};

/**
 * STRATEGIES FOR EXTRACTION
 */

// 1. DI - DECLARAÇÃO DE IMPORTAÇÃO
const extractDI = (text: string): ExtractedField[] => {
    const fields: ExtractedField[] = [];
    
    // --- Header Info ---
    const nrDI = text.match(/Declaração:\s*(\d{2}\/\d{7}-\d)/);
    if (nrDI) fields.push({ key: "Número DI", value: nrDI[1] });

    const dataRegistro = text.match(/Data do Registro:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (dataRegistro) fields.push({ key: "Data Registro", value: dataRegistro[1] });

    // --- 1. Importador ---
    // CNPJ: 12.528.708/0001-07 AERIS INDUSTRIA...
    // Note: With new line-based text, [^\n]+ stops at end of line, which is cleaner.
    const importadorMatch = text.match(/Importador\s*CNPJ:\s*([\d\.\/-]+)\s+([^\n]+)/i);
    if (importadorMatch) {
        fields.push({ key: "Importador CNPJ", value: importadorMatch[1] });
        fields.push({ key: "Importador Nome", value: importadorMatch[2].trim() });
    }

    // --- 2. Adquirente da Mercadoria ---
    const adquirenteMatch = text.match(/Adquirente da Mercadoria\s*CNPJ:\s*([\d\.\/-]+)\s+([^\n]+)/i);
    if (adquirenteMatch) {
        fields.push({ key: "Adquirente CNPJ", value: adquirenteMatch[1] });
        fields.push({ key: "Adquirente Nome", value: adquirenteMatch[2].trim() });
    }

    // --- 3. Representante Legal ---
    const repLegalMatch = text.match(/Representante Legal\s*CPF:\s*([\d\.-]+)\s+([^\n]+)/i);
    if (repLegalMatch) {
        fields.push({ key: "Representante Legal CPF", value: repLegalMatch[1] });
        fields.push({ key: "Representante Legal Nome", value: repLegalMatch[2].trim() });
    }

    // --- 4. Carga ---
    const tipoManifesto = text.match(/Tipo do Manifesto:\s*([^\n]+)/i);
    if (tipoManifesto) fields.push({ key: "Tipo do Manifesto", value: tipoManifesto[1].trim() });

    const numManifesto = text.match(/Número do Manifesto:\s*(\d+)/i);
    if (numManifesto) fields.push({ key: "Número do Manifesto", value: numManifesto[1] });

    const recinto = text.match(/Recinto Aduaneiro:\s*([^\n]+)/i);
    if (recinto) fields.push({ key: "Recinto Aduaneiro", value: recinto[1].trim() });

    const armazem = text.match(/Armazém:\s*([^\n]+)/i);
    if (armazem) fields.push({ key: "Armazém", value: armazem[1].trim() });

    // Embalagem and Quantidade might be on same line or nearby
    const embalagem = text.match(/Embalagem:\s*([A-Z\s]+?)(?=\s+Quantidade|$)/i);
    if (embalagem) fields.push({ key: "Embalagem", value: embalagem[1].trim() });

    const quantidade = text.match(/Quantidade:\s*(\d+)/i);
    if (quantidade) fields.push({ key: "Quantidade", value: quantidade[1] });

    const pesoBruto = text.match(/Peso Bruto:\s*([\d,]+)\s*Kg/i);
    if (pesoBruto) fields.push({ key: "Peso Bruto (Kg)", value: pesoBruto[1] });

    const pesoLiq = text.match(/Peso Líquido:\s*([\d,]+)\s*Kg/i);
    if (pesoLiq) fields.push({ key: "Peso Líquido (Kg)", value: pesoLiq[1] });


    // --- 5. Valores (Frete, Seguro, VMLE, VMLD) ---
    // Extract format: Label: CURRENCY VALUE
    const extractValorComplexo = (label: string, regexKey: string) => {
        // Regex matches: Label: [Currency Text] [Value]
        const regex = new RegExp(`${regexKey}:\\s*([A-Z\\/\\.\\s]+?)\\s+([\\d\\.,]+)(?=\\s|$)`, 'i');
        const match = text.match(regex);
        if (match) {
            fields.push({ key: `${label} Moeda`, value: match[1].trim() });
            fields.push({ key: `${label} Valor`, value: match[2] });
        }
    };

    extractValorComplexo("Frete", "Frete");
    extractValorComplexo("Seguro", "Seguro");
    extractValorComplexo("VMLE", "VMLE");
    extractValorComplexo("VMLD", "VMLD");

    // --- 6. Tributos (Suspenso vs Recolhido) ---
    // Format: Label: [Suspenso] [Recolhido]
    const extractTributo = (label: string, regexKey: string) => {
        const regex = new RegExp(`${regexKey}:\\s*([\\d\\.,]+)\\s+([\\d\\.,]+)`, 'i');
        const match = text.match(regex);
        if (match) {
            fields.push({ key: `${label} Suspenso`, value: match[1] });
            fields.push({ key: `${label} Recolhido`, value: match[2] });
        }
    };

    extractTributo("II", "I\\.I\\.");
    extractTributo("IPI", "I\\.P\\.I\\.");
    extractTributo("PIS/PASEP", "Pis\\/Pasep");
    extractTributo("COFINS", "Cofins");
    extractTributo("Antidumping", "Direitos Antidumping");

    // --- Page 2: Dados Complementares & Valores em Reais ---
    const extractField = (key: string, regex: RegExp) => {
        const match = text.match(regex);
        if (match) fields.push({ key, value: match[1].trim() });
    };

    extractField("AWB", /AWB:\s*([A-Z0-9]+)/i);
    extractField("MAWB/HAWB", /MAWB\/HAWB:\s*(?:MAWB:\s*)?([A-Z0-9\-]+)/i);
    extractField("Data de Chegada", /Data de Chegada:\s*([\d\/]+)/i);
    extractField("Data de Embarque", /Data de Embarque:\s*([\d\/]+)/i);
    extractField("Bandeira", /Bandeira:\s*([^\n]+)/i);
    extractField("Local de Embarque", /Local de Embarque:[\.\s]*([^\n]+)/i);
    extractField("Local de Entrada", /Local de Entrada:[\.\s]*([^\n]+)/i);
    extractField("Local de Destino", /Local de Destino:[\.\s]*([^\n]+)/i);
    extractField("Fatura Comercial", /Fatura Comercial:\s*([^\n]+)/i);
    
    // Valores em Reais (Page 2)
    extractField("TOTAL FOB (R$)", /TOTAL FOB[\.\s]*(?:EUR|USD|[\w]+)?\s*[\d\.,]+\s*R\$\s*([\d\.,]+)/i);
    extractField("TOTAL ACRESCIMOS (R$)", /TOTAL ACRESCIMOS[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("TOTAL FRETE (R$)", /TOTAL FRETE[\.\s]*(?:EUR|USD|[\w]+)?\s*[\d\.,]+\s*R\$\s*([\d\.,]+)/i);
    extractField("TOTAL SEGURO (R$)", /TOTAL SEGURO[\.\s]*(?:EUR|USD|[\w]+)?\s*[\d\.,]+\s*R\$\s*([\d\.,]+)/i);
    extractField("Total CIF (R$)", /Total CIF[\.\s]*R\$\s*([\d\.,]+)/i);
    
    extractField("TOTAL I.I. (R$)", /TOTAL I\.I\.[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("TOTAL I.P.I. (R$)", /TOTAL I\.P\.I\.[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("BASE DE CALCULO (PIS/COFINS) (R$)", /BASE DE CALCULO \(PIS\/COFINS\)[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("5602-PIS/PASEP (R$)", /5602-PIS\/PASEP[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("5629-COFINS (R$)", /5629-COFINS[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("BASE DE CALCULO ICMS (R$)", /BASE DE CALCULO ICMS[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("ICMS - RECOLHIDO (R$)", /ICMS - RECOLHIDO[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("ICMS - EXONERADO (R$)", /ICMS - EXONERADO[\.\s]*R\$\s*([\d\.,]+)/i);
    extractField("TaxaSiscomex (R$)", /TaxaSiscomex\s*R\$\s*([\d\.,]+)/i);

    if (!fields.some(f => f.key === "Via Transporte")) {
        const viaTransp = text.match(/Via de Transporte:\s*([A-Z]+)/i);
        if (viaTransp) fields.push({ key: "Via Transporte", value: viaTransp[1] });
    }

    return fields;
};

// 2. PC - PRESTAÇÃO DE CONTAS
const extractPC = (text: string, items?: PdfItem[]): ExtractedField[] => {
    const fields: ExtractedField[] = [];
    const lines = text.split('\n');

    const extractField = (key: string, regex: RegExp) => {
        const match = text.match(regex);
        if (match) fields.push({ key, value: match[1].trim() });
    };

    // --- Header / Main Details ---
    extractField("Nota Despesa Nº", /Nota Despesa Nº\s*(\d+)/i);
    extractField("Data da Emissão", /Data da Emissão\s*(\d{2}\/\d{2}\/\d{4})/i);
    extractField("Data de Vencimento", /Data de Vencimento\s*(\d{2}\/\d{2}\/\d{4})/i);
    extractField("Nr. Processo", /Nr\. Processo\s*([\d]+)/i);
    extractField("Ref. Cliente", /Ref\. Cliente\s*([\d]+)/i);
    extractField("Nr. DI", /Nr\. DI\s*([\d\/\-]+)/i);
    extractField("Agente", /Agente\s+([^\n]+)/i);
    extractField("Incoterm", /Incoterm\s+([^\n]+)/i);

    const exportador = text.match(/Exportador\s+(.*?)\s+(?:Agente|Incoterm|Via)/i);
    if (exportador) fields.push({ key: "Exportador", value: exportador[1].trim() });

    const via = text.match(/Via de Transporte\s+(.*?)\s+Analista/i);
    if (via) fields.push({ key: "Via de Transporte", value: via[1].trim() });

    const analista = text.match(/Analista Aeris\s+([\d,]+)/i);
    if (analista) fields.push({ key: "Analista Aeris", value: analista[1] });

    // Dates
    const chegada = text.match(/Chegada\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (chegada) fields.push({ key: "Data Chegada", value: chegada[1] });

    const embarque = text.match(/Embarque\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (embarque) fields.push({ key: "Data Embarque", value: embarque[1] });

    // Reference IDs
    const house = text.match(/House\s+([A-Z0-9]+)/i);
    if (house) fields.push({ key: "House", value: house[1] });

    const master = text.match(/Master\s+([A-Z0-9]+)/i);
    if (master) fields.push({ key: "Master", value: master[1] });

    // Values Header
    const cif = text.match(/CIF R\$\s*R\$\s*([\d\.,]+)/i) || text.match(/CIF R\$\s*([\d\.,]+)/i);
    if (cif) fields.push({ key: "Valor CIF (R$)", value: cif[1] });

    const fob = text.match(/FOB R\$\s*R\$\s*([\d\.,]+)/i) || text.match(/FOB R\$\s*([\d\.,]+)/i);
    if (fob) fields.push({ key: "Valor FOB (R$)", value: fob[1] });

    const frete = text.match(/Frete R\$\s*R\$\s*([\d\.,]+)/i) || text.match(/Frete R\$\s*([\d\.,]+)/i);
    if (frete) fields.push({ key: "Valor Frete (R$)", value: frete[1] });

    const seguro = text.match(/Seguro R\$\s*R\$\s*([\d\.,]+)/i) || text.match(/Seguro R\$\s*([\d\.,]+)/i);
    if (seguro) fields.push({ key: "Valor Seguro (R$)", value: seguro[1] });

    // --- Expenses Table ---
    const claimedValues = new Set<PdfItem>();
    const allValueItems = items ? items.filter(i => /^(?:-?\s*R\$\s*)?-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(i.str.trim())) : [];

    const extractExpense = (pattern: RegExp, label: string, exactLabelStr?: string) => {
        // Try spatial extraction first if items are available
        if (items && items.length > 0 && exactLabelStr) {
            // Find label item: try strict match first, then fallback to word boundary
            const strictRegex = new RegExp(`^\\s*(?:IMPOSTO\\s+)?${exactLabelStr}\\s*$`, 'i');
            let labelItem = items.find(i => strictRegex.test(i.str));
            
            if (!labelItem) {
                const fallbackRegex = new RegExp(`\\b${exactLabelStr}\\b`, 'i');
                labelItem = items.find(i => fallbackRegex.test(i.str));
            }
            
            if (labelItem) {
                // Find value items to the right that haven't been claimed
                const availableValues = allValueItems.filter(v => 
                    !claimedValues.has(v) && v.x > labelItem!.x
                );
                
                let closestValue = null;
                let minDiff = 25; // 25 pixels vertical difference tolerance
                
                for (const v of availableValues) {
                    const diff = Math.abs(v.y - labelItem.y);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestValue = v;
                    }
                }
                
                if (closestValue) {
                    claimedValues.add(closestValue);
                    const match = closestValue.str.match(/([\d\.,]+)/);
                    if (match) {
                        fields.push({ key: label, value: match[1] });
                        return; // Success with spatial
                    }
                }
            }
        }

        // Fallback to text-based regex
        const match = text.match(pattern);
        if (match && match[1]) {
            fields.push({ key: label, value: match[1].trim() });
        }
    };

    const buildRegex = (labelPattern: string) => {
        return new RegExp(`\\b${labelPattern}\\b[^\\n]{0,80}?(?:R\\$\\s*)?([\\d\\.,]{3,})`, 'i');
    };

    extractExpense(buildRegex('(?:II|I\\.I\\.|IMPOSTO DE IMPORTAÇÃO|IMPOSTO DE IMPORTACAO)'), "Despesa II", "II");
    extractExpense(buildRegex('(?:IPI|I\\.P\\.I\\.)'), "Despesa IPI", "IPI");
    extractExpense(buildRegex('PIS'), "Despesa PIS", "PIS");
    extractExpense(buildRegex('COFINS'), "Despesa COFINS", "COFINS");
    
    extractExpense(buildRegex('AFRMM'), "Despesa AFRMM", "AFRMM");
    extractExpense(buildRegex('TAXA SISCOMEX'), "Taxa SISCOMEX", "TAXA SISCOMEX");
    extractExpense(buildRegex('Serviços Profissionais de Despachante'), "Serv. Prof. Despachante", "Despachante");
    
    extractExpense(buildRegex('TRANSPORTE PORTO\\s*\\/\\s*FÁBRICA'), "Transporte Porto/Fábrica", "FÁBRICA");
    extractExpense(buildRegex('FRETE \\+ TAXAS LOCAIS'), "Frete + Taxas Locais", "LOCAIS");
    extractExpense(buildRegex('DESCONSOLIDAÇÃO'), "Desconsolidação", "DESCONSOLIDAÇÃO");
    extractExpense(buildRegex('DAE TAXAS DA SEFAZ'), "DAE Taxas SEFAZ", "SEFAZ");
    extractExpense(buildRegex('JUROS E MULTA ICMS'), "Juros e Multa ICMS", "JUROS");
    extractExpense(buildRegex('SCANNER \\+ LEVANTE'), "Scanner + Levante", "SCANNER");
    extractExpense(buildRegex('ARMAZENAGEM'), "Armazenagem", "ARMAZENAGEM");
    extractExpense(buildRegex('DAPE SERVIÇOS'), "DAPE Serviços", "DAPE");

    const totalNota = text.match(/Total Tributos e Contribuições.*?R\$\s*([\d\.,]+)/i);
    if (totalNota) fields.push({ key: "Total Tributos/Contr.", value: totalNota[1] });

    const totalGeral = text.match(/Total\s+\(1\)\s+\(2\)\s+R\$\s*([\d\.,]+)/i) || text.match(/Total\s+\(1\)\s+R\$\s*[\d\.,]+\s+\(2\)\s+R\$\s*([\d\.,]+)/i);
    if (totalGeral) fields.push({ key: "Total Geral", value: totalGeral[1] });

    // Summary Details
    extractField("Total Serviços (- Impostos Retidos)", /Total Serviços \(- Impostos Retidos\)\s*(?:R\$?\s*)?([\d\.,]+)/i);
    extractField("Total Despesas Pagas Comissária", /Total Despesas Pagas\s*(?:R\$?\s*)?([\d\.,]+)/i);
    
    // Capture negative signs for these
    const adiantamentos = text.match(/Total Adiantamentos\s*(-?R\$?\s*[\d\.,]+)/i);
    if (adiantamentos) fields.push({ key: "Total Adiantamentos", value: adiantamentos[1].replace(/\s+/g, '') });

    const totalPagar = text.match(/Total a Pagar\s*(?:R\$?\s*)?([\d\.,]+)/i);
    if (totalPagar) fields.push({ key: "Total a Pagar", value: totalPagar[1] });

    const saldoDSV = text.match(/Saldo a favor da DSV\s*(-?R\$?\s*[\d\.,]+)/i);
    if (saldoDSV) fields.push({ key: "Saldo a favor da DSV", value: saldoDSV[1].replace(/\s+/g, '') });

    // Tributos Retidos
    const extractTax = (name: string, regex: RegExp) => {
        const match = text.match(regex);
        if (match) {
            fields.push({ key: `Tributo ${name} (%)`, value: match[1] });
            fields.push({ key: `Tributo ${name} (R$)`, value: match[2] });
        }
    };
    extractTax("PIS", /PIS\s*([\d\.,]+%)\s*R\$\s*([\d\.,]+)/i);
    extractTax("COFINS", /COFINS\s*([\d\.,]+%)\s*R\$\s*([\d\.,]+)/i);
    extractTax("CSLL", /CSLL\s*([\d\.,]+%)\s*R\$\s*([\d\.,]+)/i);
    extractTax("IRRF", /IRRF\s*([\d\.,]+%)\s*R\$\s*([\d\.,]+)/i);

    const totalTributos = text.match(/Total Tributos e Contribuições\s*R\$\s*([\d\.,]+)/i);
    if (totalTributos) fields.push({ key: "Total Tributos e Contribuições", value: totalTributos[1] });

    return fields;
};

// 3. APM TERMINALS (Receipts/Invoices)
const extractAPM = (text: string): ExtractedField[] => {
    const fields: ExtractedField[] = [];

    // Basic Info
    const noteNumber = text.match(/Fiscal Note Number\s*(\d+)/i) || text.match(/NFS-e\s*(\d+)/i);
    if (noteNumber) fields.push({ key: "Número Nota", value: noteNumber[1] });

    const issueDate = text.match(/Issue Date\s*(\d{2}\/\d{2}\/\d{4})/i) || text.match(/Emissão\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (issueDate) fields.push({ key: "Data Emissão", value: issueDate[1] });

    const cnpjPrestador = text.match(/CNPJ\s*(05\.388\.226\/0001-25)/); // APM Specific
    if (cnpjPrestador) fields.push({ key: "CNPJ Prestador", value: cnpjPrestador[1] });

    // --- Service Items Table ---
    const serviceRegex = /(\d+)\s+([A-ZÀ-ÚÇ\s\-\.\/]+)\s+(\d+(?:,\d+)?)\s+([\d\.,]+)\s+([\d\.,]+)/g;
    let serviceMatch;
    
    while ((serviceMatch = serviceRegex.exec(text)) !== null) {
        if (serviceMatch[2].trim().length > 3) {
            fields.push({ key: `Item ${serviceMatch[1]} Descrição`, value: serviceMatch[2].trim() });
            fields.push({ key: `Item ${serviceMatch[1]} Qtd`, value: serviceMatch[3] });
            fields.push({ key: `Item ${serviceMatch[1]} Valor Unit.`, value: serviceMatch[4] });
            fields.push({ key: `Item ${serviceMatch[1]} Valor Total`, value: serviceMatch[5] });
        }
    }

    // --- Value Detail Table ---
    const taxBaseMatch = text.match(/0,00\s+([\d\.,]+)\s+([\d\.,]+)(?=\s*Regime|\s*Normal|\s*$)/m);
    if (taxBaseMatch) {
         fields.push({ key: "Base de Cálculo ISS", value: taxBaseMatch[1] });
         fields.push({ key: "Valor ISS", value: taxBaseMatch[2] });
    }

    const aliquotaMatch = text.match(/NÃO\s+0,00\s+(\d+(?:[\.,]\d+)?)\s+([\d\.,]+)/i);
    if (aliquotaMatch) {
        fields.push({ key: "Alíquota (%)", value: aliquotaMatch[1] });
    }

    const totalValue = text.match(/VALOR TOTAL DA NFS-e\s*R\$\s*([\d\.,]+)/i);
    if (totalValue) fields.push({ key: "Valor Total NFS-e", value: totalValue[1] });

    const liquidValue = text.match(/VALOR LÍQUIDO\s*R\$\s*([\d\.,]+)/i);
    if (liquidValue) fields.push({ key: "Valor Líquido", value: liquidValue[1] });

    const issRetido = text.match(/ISS\s*Retido\s*[\d,]*\s*([\d\.,]+)/i); 
    if (issRetido && !fields.some(f => f.key === "ISS Retido")) {
        fields.push({ key: "ISS Retido", value: issRetido[1] });
    }

    return fields;
};

// 4. ICMS / DAE (State Tax)
const extractICMS = (text: string): ExtractedField[] => {
    const fields: ExtractedField[] = [];

    const receita = text.match(/1 - CÓDIGO\/ESPECIFICAÇÃO DA RECEITA\s*([\d]+ - [^\n]+)/i) ||
                    text.match(/(\d{4} - ICMS [^\n]+)/i);
    if (receita) fields.push({ key: "Código Receita", value: receita[1].trim() });

    const dataVenc = text.match(/2 - DATA VENCIMENTO\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataVenc) fields.push({ key: "Data Vencimento", value: dataVenc[1] });

    const pagtoAte = text.match(/3 - PAGAMENTO ATÉ\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (pagtoAte) fields.push({ key: "Pagamento Até", value: pagtoAte[1] });

    const nossoNum = text.match(/4 - NOSSO NÚMERO\s*([\d\.-]+)/i);
    if (nossoNum) fields.push({ key: "Nosso Número", value: nossoNum[1] });

    const periodo = text.match(/5 - PERÍODO REFERÊNCIA\s*(\d{2}\/\d{4})/i);
    if (periodo) fields.push({ key: "Período Referência", value: periodo[1] });

    const vlrPrincipal = text.match(/6 - VALOR PRINCIPAL\s*R\$\s*([\d\.,]+)/i);
    if (vlrPrincipal) fields.push({ key: "Valor Principal", value: vlrPrincipal[1] });

    const multa = text.match(/7 - MULTA\s*R\$\s*([\d\.,]+)/i);
    if (multa) fields.push({ key: "Multa", value: multa[1] });

    const juros = text.match(/8 - JUROS\s*R\$\s*([\d\.,]+)/i);
    if (juros) fields.push({ key: "Juros", value: juros[1] });

    const descontos = text.match(/9 - DESCONTOS\s*R\$\s*([\d\.,]+)/i);
    if (descontos) fields.push({ key: "Descontos", value: descontos[1] });

    const total = text.match(/10 - TOTAL A RECOLHER\s*R\$\s*([\d\.,]+)/i);
    if (total) fields.push({ key: "Valor Total a Recolher", value: total[1] });

    const diInfo = text.match(/DI:\s*(\d{2}\/\d{7}-\d)/i) || text.match(/DI:\s*([\d\/\-]+)/i);
    if (diInfo) fields.push({ key: "Info Compl. DI", value: diInfo[1] });

    const barcode = text.match(/NUMERAÇÃO DO CÓDIGO DE BARRAS\s*([\d\s]+)/i) || 
                    text.match(/13 - CÓDIGO DE BARRA\s*([\d\s]+)/i);
    if (barcode) fields.push({ key: "Código de Barras", value: barcode[1].replace(/\D/g, '') });

    return fields;
};

// 5. NF - NOTA FISCAL DE SERVIÇO (General/DSV)
const extractNF = (text: string): ExtractedField[] => {
    const fields: ExtractedField[] = [];

    const numNota = text.match(/Nº:\s*(\d+)/i) || text.match(/Nota Fiscal\s*(\d+)/i);
    if (numNota) fields.push({ key: "Número Nota", value: numNota[1] });

    const prestador = text.match(/PRESTADOR DOS SERVIÇOS[\s\S]*?Razão Social:\s*([^\n]+)/i);
    if (prestador) fields.push({ key: "Prestador", value: prestador[1].trim() });
    
    if (!prestador && text.includes("DSV AIR & SEA")) {
         fields.push({ key: "Prestador", value: "DSV AIR & SEA BRASIL LTDA" });
    }

    const tomador = text.match(/TOMADOR DOS SERVIÇOS[\s\S]*?Razão Social:\s*([^\n]+)/i);
    if (tomador) fields.push({ key: "Tomador", value: tomador[1].trim() });

    const valorTotal = text.match(/VALOR TOTAL DA NOTA\s*=\s*R\$\s*([\d\.,]+)/i);
    if (valorTotal) fields.push({ key: "Valor Total", value: valorTotal[1] });

    const pis = text.match(/Retenção PIS\s*R\$\s*([\d\.,]+)/i);
    if (pis) fields.push({ key: "Retenção PIS", value: pis[1] });

    const cofins = text.match(/Retenção COFINS\s*R\$\s*([\d\.,]+)/i);
    if (cofins) fields.push({ key: "Retenção COFINS", value: cofins[1] });

    const csll = text.match(/Retenção CSLL\s*R\$\s*([\d\.,]+)/i);
    if (csll) fields.push({ key: "Retenção CSLL", value: csll[1] });

    return fields;
};

// 6. DSV SPECIFIC NF
const extractDSV = (text: string): ExtractedField[] => {
    const fields: ExtractedField[] = [];

    const numNota = text.match(/Nº:?\s*(\d+)/i) || text.match(/Nota Fiscal\s*(\d+)/i) || text.match(/Número da NFS-e[\s\n]*(\d+)/i);
    if (numNota) fields.push({ key: "Número Nota", value: numNota[1] });
    
    const emissao = text.match(/Emitida em:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i) || text.match(/Emitida em:\s*(\d{2}\/\d{2}\/\d{4})/i) || text.match(/Data e Hora de Emissão[\s\n]*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/i);
    if (emissao) fields.push({ key: "Data Emissão", value: emissao[1] });

    const codVerificacao = text.match(/Código de Verificação:?\s*([A-Z0-9]+)/i) || text.match(/Código de Verificação[\s\n]*([A-Z0-9]+)/i);
    if (codVerificacao) fields.push({ key: "Código Verificação", value: codVerificacao[1] });

    // Prestador
    const prestadorCNPJ = text.match(/PRESTADOR DE SERVIÇOS[\s\S]*?CNPJ:\s*([\d\.\/-]+)/i) || text.match(/PRESTADOR DOS SERVIÇOS[\s\S]*?CPF\/CNPJ:\s*([\d\.\/-]+)/i);
    if (prestadorCNPJ) fields.push({ key: "CNPJ Prestador", value: prestadorCNPJ[1] });

    const prestadorNome = text.match(/PRESTADOR DE SERVIÇOS[\s\S]*?Razão Social:\s*([^\n]+)/i) || text.match(/PRESTADOR DOS SERVIÇOS[\s\S]*?Nome\/Razão Social:\s*([^\n]+)/i);
    if (prestadorNome) fields.push({ key: "Nome Prestador", value: prestadorNome[1].replace(/&amp;/g, '&').trim() });

    const inscricaoMunicipal = text.match(/Inscrição Municipal:\s*(\d+)/i);
    if (inscricaoMunicipal) fields.push({ key: "Inscrição Municipal", value: inscricaoMunicipal[1] });

    // Tomador
    const tomadorNome = text.match(/TOMADOR DE SERVIÇOS[\s\S]*?Nome:\s*([^\n]+)/i) || text.match(/TOMADOR DOS SERVIÇOS[\s\S]*?Nome\/Razão Social:\s*([^\n]+)/i);
    if (tomadorNome) fields.push({ key: "Nome Tomador", value: tomadorNome[1].trim() });

    const tomadorEndereco = text.match(/TOMADOR DE SERVIÇOS[\s\S]*?Endereço:\s*([^\n]+[\s\S]*?CEP:\s*[\d-]+)/i) || text.match(/TOMADOR DOS SERVIÇOS[\s\S]*?Endereço:\s*([^\n]+)/i);
    if (tomadorEndereco) fields.push({ key: "Endereço Tomador", value: tomadorEndereco[1].replace(/\n/g, ' ').trim() });

    const tomadorCNPJ = text.match(/TOMADOR DE SERVIÇOS[\s\S]*?CPF\/CNPJ:\s*([\d\.\/-]+)/i) || text.match(/TOMADOR DOS SERVIÇOS[\s\S]*?CPF\/CNPJ:\s*([\d\.\/-]+)/i);
    if (tomadorCNPJ) fields.push({ key: "CNPJ Tomador", value: tomadorCNPJ[1] });

    const total = text.match(/VALOR TOTAL DA NOTA[\s\n]*=[\s\n]*R\$[\s\n]*([\d\.,]+)/i) || text.match(/VALOR DOS SERVIÇOS:\s*([\d\.,]+)/i);
    if (total) fields.push({ key: "Valor Total da Nota", value: total[1] });

    const valorServicos = text.match(/VALOR DOS SERVIÇOS:\s*([\d\.,]+)/i);
    if (valorServicos) fields.push({ key: "Valor dos Serviços", value: valorServicos[1] });

    const valorLiquido = text.match(/VALOR LÍQUIDO:\s*([\d\.,]+)/i);
    if (valorLiquido) fields.push({ key: "Valor Líquido", value: valorLiquido[1] });

    // Discriminação
    const discriminacao = text.match(/DISCRIMINAÇÃO DOS SERVIÇOS\s*([\s\S]*?)(?=Retenção|VALOR TOTAL|VALOR DOS SERVIÇOS|Código da Atividade|VALOR LÍQUIDO|OUTRAS INFORMAÇÕES)/i);
    if (discriminacao) {
        const discText = discriminacao[1].trim();
        fields.push({ key: "Discriminação dos Serviços", value: discText.replace(/\n/g, ' ') });
        
        // Try to extract the first line which usually contains the main service description and value
        // Looking for a pattern like "DESCRIPTION 100,00"
        const firstLineMatch = discText.match(/^([^\n]+?)\s+([\d\.,]+)(?:\n|$)/);
        if (firstLineMatch) {
            fields.push({ key: "Descrição da Despesa", value: firstLineMatch[1].trim() });
            fields.push({ key: "Valor da Despesa", value: firstLineMatch[2].trim() });
        } else {
            // Fallback for when the value is on a new line or formatted differently
            const descMatch = discText.match(/^([^\n]+)/);
            if (descMatch) {
                fields.push({ key: "Descrição da Despesa", value: descMatch[1].trim() });
            }
            
            // Try to find a standalone value in the discrimination text
            const valMatch = discText.match(/([\d\.,]{4,})/);
            if (valMatch) {
                 fields.push({ key: "Valor da Despesa", value: valMatch[1].trim() });
            }
        }
    }

    const activity = text.match(/Código da Atividade\/Serviço Prestado:[\s\n]*([\d\s]+)/i) || text.match(/Código do Serviço:[\s\n]*([\d\s]+)/i);
    if (activity) fields.push({ key: "Cód. Atividade", value: activity[1].trim() });

    const location = text.match(/Local da prestação do serviço[\s\n]+([A-Z\s\/]+-[A-Z]{2})/i);
    if (location) fields.push({ key: "Local Prestação", value: location[1].trim() });

    const deducoes = text.match(/Deduções[\s\n]*R\$[\s\n]*([\d\.,]+)/i) || text.match(/Valor Total das Deduções \(R\$\)[\s\n]*([\d\.,]+)/i);
    if (deducoes) fields.push({ key: "Deduções", value: deducoes[1] });

    const baseCalculo = text.match(/Base de Cálculo \(R\$\)[\s\n]*([\d\.,]+)/i) || text.match(/Base de Cálculo[\s\n]*([\d\.,]+)/i);
    if (baseCalculo) fields.push({ key: "Base de Cálculo", value: baseCalculo[1] });

    const aliquota = text.match(/Aliquota[\s\n]*([\d\.,]+)[\s\n]*%/i) || text.match(/Alíquota \(%\)[\s\n]*([\d\.,]+)[\s\n]*%/i) || text.match(/Alíquota[\s\n]*([\d\.,]+)[\s\n]*%/i);
    if (aliquota) fields.push({ key: "Alíquota (%)", value: aliquota[1] });

    const credito = text.match(/Crédito[\s\n]*R\$[\s\n]*([\d\.,]+)/i) || text.match(/Crédito[\s\n]*([\d\.,]+)/i);
    if (credito) fields.push({ key: "Crédito", value: credito[1] });

    const valorISS = text.match(/Valor do ISS[\s\n]*R\$[\s\n]*([\d\.,]+)/i) || text.match(/Valor do ISS \(R\$\)[\s\n]*([\d\.,]+)/i) || text.match(/Valor do ISS[\s\n]*([\d\.,]+)/i);
    if (valorISS) fields.push({ key: "Valor do ISS", value: valorISS[1] });

    const retencaoISS = text.match(/Retenção ISS[\s\n]*R\$[\s\n]*([\d\.,]+)/i);
    if (retencaoISS) fields.push({ key: "Retenção ISS", value: retencaoISS[1] });

    // Outras Informações
    const outrasInfo = text.match(/OUTRAS INFORMAÇÕES\s*([\s\S]*?)$/i);
    if (outrasInfo) {
        fields.push({ key: "Outras Informações", value: outrasInfo[1].trim().replace(/\n/g, ' ') });
    }

    return fields;
};

// 8. PACKING LIST (AÉREO - FORTALEZA)
const extractPackingListAereo = (text: string): ExtractedField[] => {
    const fields: ExtractedField[] = [];

    const extractField = (key: string, regex: RegExp) => {
        const match = text.match(regex);
        if (match) fields.push({ key, value: match[1].trim() });
    };

    extractField("Consignee", /Consignee:\s*([\s\S]*?)(?=Ship-to party:|Date:)/i);
    extractField("Ship-to party", /Ship-to party:\s*([\s\S]*?)(?=Manufacturer:|Item no\.|Date:)/i);
    extractField("Date", /Date:\s*([^\n]+)/i);
    extractField("Created by", /Created by:\s*([^\n]+)/i);
    extractField("Shipment no.", /Shipment no\.?\s*([^\n]+)/i);
    extractField("No. of packages", /No\. of packages:\s*([^\n]+)/i);
    extractField("Order no.", /Order no\.:\s*([^\n]+)/i);
    extractField("Delivery no.", /Delivery no\.:\s*([^\n]+)/i);
    extractField("Your reference", /Your reference:\s*([^\n]+)/i);
    extractField("Gross Weight KG", /Gross Weight KG:\s*([^\n]+)/i);
    extractField("Net Weight KG", /Net Weight KG:\s*([^\n]+)/i);
    extractField("Manufacturer", /Manufacturer:\s*([^\n]+)/i);
    extractField("Country Of Origin", /Country Of Origin[^\:]*:\s*([^\n]+)/i);

    const lines = text.split('\n');
    let currentItem: any = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Match item row: e.g., "51039201 CT392 SENSOR OPTICAL F BLADE 17 PCS"
        const itemMatch = line.match(/^(\d{6,})\s+(.*?)\s+(\d+(?:[.,]\d+)?)(?:\s+([A-Z]{1,4})\.?)?$/i);
        if (itemMatch) {
            if (currentItem) {
                // Push previous item
                fields.push({ key: `Item ${currentItem.no} Descrição`, value: currentItem.desc });
                fields.push({ key: `Item ${currentItem.no} Qtd`, value: currentItem.qty });
                fields.push({ key: `Item ${currentItem.no} UoM`, value: currentItem.uom });
            }
            
            currentItem = {
                no: itemMatch[1],
                desc: itemMatch[2],
                qty: itemMatch[3],
                uom: itemMatch[4],
                foundSap: itemMatch[2].toUpperCase().includes("SAP CODE")
            };
        } else if (currentItem && !currentItem.foundSap) {
            if (/^(Box:|Gross Weight:|Item no\.|The solid packing materials|Address:|Tel:)/i.test(line)) {
                currentItem.foundSap = true; // Stop appending
                continue;
            }
            // Append to description until SAP Code is found
            currentItem.desc += " " + line;
            if (line.toUpperCase().includes("SAP CODE")) {
                currentItem.foundSap = true;
            }
        }
    }

    if (currentItem) {
        fields.push({ key: `Item ${currentItem.no} Descrição`, value: currentItem.desc });
        fields.push({ key: `Item ${currentItem.no} Qtd`, value: currentItem.qty });
        fields.push({ key: `Item ${currentItem.no} UoM`, value: currentItem.uom });
    }

    return fields;
};

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Main Extraction Function
export const extractDataFromPdf = async (
  fileData: FileData,
  selectedMode: string,
  forceLocal: boolean = false
): Promise<FileExtractionResult | null> => {
  try {
    let tokensUsed = 0;
    const arrayBuffer = await readFileAsArrayBuffer(fileData.file);
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = "";
    const pdfItems: PdfItem[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const items: any[] = textContent.items as any[];
      
      for (const item of items) {
          pdfItems.push({
              str: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: item.height
          });
      }

      // Sort items by Y descending first for fullText generation
      items.sort((a, b) => b.transform[5] - a.transform[5]);
      
      const linesArr: any[][] = [];
      let currentLine: any[] = [];
      let currentY = items.length > 0 ? items[0].transform[5] : 0;

      for (const item of items) {
          // Threshold for same line: 6 points
          if (Math.abs(item.transform[5] - currentY) > 6) {
              linesArr.push(currentLine);
              currentLine = [item];
              currentY = item.transform[5];
          } else {
              currentLine.push(item);
          }
      }
      if (currentLine.length > 0) linesArr.push(currentLine);

      let pageText = "";
      for (const lineItems of linesArr) {
          // Sort items in the same line by X ascending
          lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
          pageText += lineItems.map(item => item.str).join(" ") + "\n";
      }
      
      fullText += pageText + "\n";
    }

    let fields: ExtractedField[] = [];
    const upperText = fullText.toUpperCase();
    const fileNameUpper = fileData.name.toUpperCase();

    const runLocalExtraction = () => {
        const isPackingListAereo = () => {
            if (selectedMode !== 'AEREO_FOR') return false;
            
            if (upperText.includes("PACKING LIST") && (upperText.includes("VESTAS") || upperText.includes("CONSIGNEE"))) {
                return true;
            }

            const hasPL = Array.from({length: 10}, (_, i) => `PL\\s*${i+1}`).some(plRegex => {
                const re = new RegExp(plRegex, 'i');
                return re.test(fileNameUpper) || re.test(upperText);
            });
            return hasPL && upperText.includes("PACKING LIST");
        };

        // CLASSIFICATION LOGIC
        if (isPackingListAereo()) {
            return extractPackingListAereo(fullText);
        }
        else if (upperText.includes("COMPROVANTE DE IMPORTAÇÃO") || (upperText.includes("RECEITA FEDERAL DO BRASIL") && upperText.includes("IMPORTAÇÃO"))) {
            const ciFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            ciFields.push({ key: "DI", value: extractRegex(/DECLARAÇÃO DE IMPORTAÇÃO Nº[\s\S]*?\n\s*([\d\.\/-]+)/i) || extractRegex(/DECLARAÇÃO DE IMPORTAÇÃO Nº\s*\n?([\d\.\/-]+)/i) });
            ciFields.push({ key: "Importador", value: extractRegex(/NOME DO IMPORTADOR[\s\S]*?\n\s*([^\n]+?)(?:\s+\d{2}\.|\s*$)/i) || extractRegex(/NOME DO IMPORTADOR\s*\n?([^\n]+)/i) });
            ciFields.push({ key: "Valor Total", value: extractRegex(/VALOR TOTAL DA IMPORTAÇÃO \(R\$\)[\s\S]*?\n\s*([\d\.,]+)/i) || extractRegex(/VALOR TOTAL DA IMPORTAÇÃO \(R\$\)\s*\n?([\d\.,]+)/i) });
            return ciFields;
        }
        else if (upperText.includes("DECLARAÇÃO DE IMPORTAÇÃO") || upperText.includes("EXTRATO DA DECLARAÇÃO")) {
            return extractDI(fullText);
        } 
        else if (fileNameUpper.endsWith("PC.PDF") || (upperText.includes("CLASSIFICAÇÃO DAS DESPESAS") && upperText.includes("PAGAS PELO CLIENTE"))) {
            return extractPC(fullText, pdfItems);
        }
        else if (upperText.includes("APM TERMINALS") || upperText.includes("APM TERM") || fileNameUpper.includes("APM TERM")) {
            return extractAPM(fullText);
        } 
        else if ((upperText.includes("DAE") && upperText.includes("ARRECADAÇÃO ESTADUAL")) || upperText.includes("ICMS IMPORTACAO")) {
            return extractICMS(fullText);
        } 
        else if (upperText.includes("NOTA FISCAL DE SERVIÇO") || upperText.includes("NFS-E") || fileNameUpper.includes("NF IMPORT")) {
            if ((fileNameUpper.includes("NF SERVIÇOS DSV") || fileNameUpper.includes("NF SERVICOS DSV")) && selectedMode === 'AEREO_FOR') {
                 return extractDSV(fullText);
            } else {
                 return extractNF(fullText);
            }
        } 
        else if (upperText.includes("DANFE") || upperText.includes("NOTA FISCAL ELETRÔNICA") || upperText.includes("NOTA FISCAL ELETRONICA")) {
            // Basic local extraction for DANFE
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            const danfeFields: ExtractedField[] = [];
            danfeFields.push({ key: "Número", value: extractRegex(/N[º°]\s*0*([\d]+)/i) });
            danfeFields.push({ key: "Série", value: extractRegex(/S[ÉE]RIE:\s*([\d]+)/i) });
            danfeFields.push({ key: "Chave de Acesso", value: extractRegex(/CHAVE DE ACESSO.*?([\d\s]{44})/i)?.replace(/\s/g, '') || "" });
            danfeFields.push({ key: "Natureza da Operação", value: extractRegex(/NATUREZA DA OPERAÇÃO\s*\n?([^\n]+)/i) });
            danfeFields.push({ key: "Data de Emissão", value: extractRegex(/DATA DA EMISSÃO\s*\n?([\d\.]+)/i) });
            danfeFields.push({ key: "Emitente Nome", value: extractRegex(/AERIS IND\. COM\.|VESTAS MANUFACTURING/i) ? (upperText.includes("AERIS IND") ? "AERIS IND. COM. EQUIP. P/GER. ENERGIA SA" : "VESTAS MANUFACTURING A/S HAMMEL") : "" });
            danfeFields.push({ key: "Emitente CNPJ", value: extractRegex(/CNPJ\s*\n?([\d\.\/-]+)/i) });
            
            // Block-based extraction for values (Most robust for DANFE)
            const calcImpostoBlock = fullText.match(/CÁLCULO DO IMPOSTO[\s\S]*?(?:TRANSPORTADOR|FATURA)/i);
            if (calcImpostoBlock) {
                const blockText = calcImpostoBlock[0];
                // Extract all numbers in the format 0,00 or 1.000,00
                const numbersMatch = Array.from(blockText.matchAll(/(?<![\d.,])[0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}(?![\d.,])/g)).map(m => m[0]);
                
                if (numbersMatch.length >= 11) {
                    danfeFields.push({ key: "Valor Total dos Produtos", value: numbersMatch[4] });
                    danfeFields.push({ key: "Valor do Frete", value: numbersMatch[5] });
                    danfeFields.push({ key: "Valor do Seguro", value: numbersMatch[6] });
                    danfeFields.push({ key: "Desconto", value: numbersMatch[7] });
                    danfeFields.push({ key: "Despesas Acessórias", value: numbersMatch[8] });
                    danfeFields.push({ key: "Valor do IPI", value: numbersMatch[9] });
                    danfeFields.push({ key: "Valor Total da Nota", value: numbersMatch[10] });
                } else {
                    // Fallback if exactly 11 numbers aren't found
                    danfeFields.push({ key: "Valor Total dos Produtos", value: extractRegex(/VALOR TOTAL DOS PRODUTOS\s*\n?\s*([\d\.,]+)/i) });
                    danfeFields.push({ key: "Valor Total da Nota", value: extractRegex(/VALOR TOTAL DA NOTA\s*\n?\s*([\d\.,]+)/i) });
                    danfeFields.push({ key: "Valor do Frete", value: extractRegex(/VALOR DO FRETE\s*\n?\s*([\d\.,]+)/i) });
                    danfeFields.push({ key: "Valor do Seguro", value: extractRegex(/VALOR DO SEGURO\s*\n?\s*([\d\.,]+)/i) });
                    danfeFields.push({ key: "Desconto", value: extractRegex(/DESCONTO\s*\n?\s*([\d\.,]+)/i) });
                    danfeFields.push({ key: "Despesas Acessórias", value: extractRegex(/DESPESAS ACESSÓRIAS\s*\n?\s*([\d\.,]+)/i) });
                    danfeFields.push({ key: "Valor do IPI", value: extractRegex(/VALOR DO IPI\s*\n?\s*([\d\.,]+)/i) });
                }
            } else {
                // Absolute fallback
                danfeFields.push({ key: "Valor Total dos Produtos", value: extractRegex(/VALOR TOTAL DOS PRODUTOS\s*\n?\s*([\d\.,]+)/i) });
                danfeFields.push({ key: "Valor Total da Nota", value: extractRegex(/VALOR TOTAL DA NOTA\s*\n?\s*([\d\.,]+)/i) });
                danfeFields.push({ key: "Valor do Frete", value: extractRegex(/VALOR DO FRETE\s*\n?\s*([\d\.,]+)/i) });
                danfeFields.push({ key: "Valor do Seguro", value: extractRegex(/VALOR DO SEGURO\s*\n?\s*([\d\.,]+)/i) });
                danfeFields.push({ key: "Desconto", value: extractRegex(/DESCONTO\s*\n?\s*([\d\.,]+)/i) });
                danfeFields.push({ key: "Despesas Acessórias", value: extractRegex(/DESPESAS ACESSÓRIAS\s*\n?\s*([\d\.,]+)/i) });
                danfeFields.push({ key: "Valor do IPI", value: extractRegex(/VALOR DO IPI\s*\n?\s*([\d\.,]+)/i) });
            }
            return danfeFields;
        }
        else if (upperText.includes("AIRWAYBILL") || upperText.includes("AIR WAYBILL") || fileNameUpper.includes("AWB")) {
            const awbFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            awbFields.push({ key: "AWB Number", value: extractRegex(/\b(\d{3}-\d{8}|\d{7})\b/i) });
            awbFields.push({ key: "Shipper", value: extractRegex(/Shipper's Name and Address\s*\n?([^\n]+)/i) });
            awbFields.push({ key: "Consignee", value: extractRegex(/Consignee's Name and Address\s*\n?([^\n]+)/i) });
            awbFields.push({ key: "Gross Weight", value: extractRegex(/Gross\s*Weight\s*\n?([\d\.,]+)/i) });
            awbFields.push({ key: "Chargeable Weight", value: extractRegex(/Chargeable\s*Weight\s*\n?([\d\.,]+)/i) });
            awbFields.push({ key: "Total", value: extractRegex(/Total\s*\n?([\d\.,]+)/i) });
            return awbFields;
        }
        else if (upperText.includes("GUIA PARA LIBERAÇÃO DE MERCADORIA ESTRANGEIRA") || upperText.includes("GLME")) {
            const glmeFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            glmeFields.push({ key: "Importador", value: extractRegex(/2\.1 - Nome \/ Razão Social[\s\S]*?\n([^\n]+)/i) });
            glmeFields.push({ key: "CNPJ", value: extractRegex(/2\.3 - CNPJ\/CPF[\s\S]*?\n\s*\d+\s+([\d\.\/-]+)/i) || extractRegex(/2\.3 - CNPJ\/CPF[\s\S]*?\n([\d\.\/-]+)/i) });
            glmeFields.push({ key: "DI", value: extractRegex(/4\.1 - Número[\s\S]*?\n(?:DI\s*)?([\d]+)/i) });
            glmeFields.push({ key: "Valor CIF", value: extractRegex(/4\.3 - Valor CIF[\s\S]*?R\$\s*([\d\.,]+)/i) });
            glmeFields.push({ key: "NCM", value: extractRegex(/5\.2 - Classe Tarifária[\s\S]*?\n\s*\d+\s+([\d]+)/i) || extractRegex(/5\.2 - Classe Tarifária[\s\S]*?\n([\d]+)/i) });
            return glmeFields;
        }
        else if (upperText.includes("DAPE - SERVIÇOS COM CARGA ATRELADA") || upperText.includes("DAPE")) {
            const dapeFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            dapeFields.push({ key: "Número do Documento", value: extractRegex(/(DAPE\s*-\s*[\d\.]+)/i) });
            dapeFields.push({ key: "Consignatário", value: extractRegex(/[\d\.\/-]+\s*-\s*(AERIS[^\n]+)/i) });
            dapeFields.push({ key: "Documento (HAWB)", value: extractRegex(/([\d]+\s*-\s*HAWB)/i) });
            dapeFields.push({ key: "Valor a Pagar", value: extractRegex(/VALOR A PAGAR[\s\S]*?\n\s*([\d\.,]+)/i) || extractRegex(/TOTAL:\s*([\d\.,]+)/i) });
            return dapeFields;
        }
        else if (upperText.includes("DOCUMENTO AUXILIAR DO CONHECIMENTO DE TRANSPORTE ELETRÔNICO") || upperText.includes("DACTE") || upperText.includes("CT-E")) {
            const cteFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            cteFields.push({ key: "Número", value: extractRegex(/NÚMERO[\s\S]*?\n\s*\d+\s+\d+\s+([\d]+)/i) || extractRegex(/NÚMERO\s*\n?([\d]+)/i) });
            cteFields.push({ key: "Chave de Acesso", value: extractRegex(/Chave de acesso\s*\n?([\d\.\-]+)/i) });
            cteFields.push({ key: "Remetente", value: extractRegex(/REMETENTE:\s*([^\n]+)/i) });
            cteFields.push({ key: "Destinatário", value: extractRegex(/DESTINATÁRIO:\s*([^\n]+)/i) });
            cteFields.push({ key: "Valor Total da Prestação", value: extractRegex(/VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO\s*\n?([\d\.,]+)/i) });
            cteFields.push({ key: "Peso Bruto", value: extractRegex(/PESO BRUTO \(KG\)[\s\S]*?\n\s*(?:CARGA\s*)?([\d\.,]+)/i) });
            return cteFields;
        }
        else if (upperText.includes("COMPROVANTE DE PAGAMENTO") && upperText.includes("SISBB")) {
            const bbFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            bbFields.push({ key: "Valor Total", value: extractRegex(/Valor Total\s*\n?([\d\.,]+)/i) });
            bbFields.push({ key: "Data do Pagamento", value: extractRegex(/Data do pagamento\s*\n?([\d\/]+)/i) });
            bbFields.push({ key: "Código de Barras", value: extractRegex(/Codigo de Barras\s*\n?([\d\s\-]+(?:\n[\d\s\-]+)?)/i)?.replace(/\n/g, ' ') || "" });
            return bbFields;
        }
        else if (upperText.includes("COMPROVANTE DE OPERAÇÃO") && upperText.includes("ITAÚ")) {
            const itauFields: ExtractedField[] = [];
            const extractRegex = (regex: RegExp, defaultVal: string = "") => {
                const match = fullText.match(regex);
                return match && match[1] ? match[1].trim() : defaultVal;
            };
            itauFields.push({ key: "Valor Pago", value: extractRegex(/Valor pago:\s*R\$\s*([\d\.,]+)/i) });
            itauFields.push({ key: "Data do Pagamento", value: extractRegex(/Pagamento efetuado em\s*([\d\.]+)/i) });
            itauFields.push({ key: "Representação Numérica", value: extractRegex(/Representação numérica[\s\S]*?do código de barras:\s*([\d\s]+)/i) });
            return itauFields;
        }
        else {
            const fallbackFields: ExtractedField[] = [];
            fallbackFields.push({ key: "Status", value: "Unclassified Document Type" });
            const genericCnpj = fullText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
            if (genericCnpj) fallbackFields.push({ key: "CNPJ Found", value: genericCnpj[0] });
            const genericValue = fullText.match(/R\$\s*([\d\.,]+)/);
            if (genericValue) fallbackFields.push({ key: "Possible Value", value: genericValue[1] });
            return fallbackFields;
        }
    };

    // If text is too short, it's likely a scanned PDF
    const isPC = fileNameUpper.endsWith("PC.PDF") || fileNameUpper.includes("PC") || upperText.includes("PRESTAÇÃO DE CONTAS") || upperText.includes("PRESTACAO DE CONTAS");

    const alwaysUseAI = 
        fileNameUpper.includes("VESTAS NF SERVIÇOS DSV") || 
        fileNameUpper.includes("VESTAS NF SERVICOS DSV") ||
        fileNameUpper.includes("COMP DAPE") || 
        fileNameUpper.includes("COMP DAI") || 
        fileNameUpper.includes("NF IMPORT") || 
        fileNameUpper.includes("ND IMPORT") ||
        fileNameUpper.endsWith("DI.PDF") ||
        fileNameUpper.endsWith("DI");

    if (forceLocal || (isPC && !alwaysUseAI)) {
        console.log(`Forcing local extraction for ${fileData.name} (isPC: ${isPC})`);
        fields = runLocalExtraction();
    } else if (alwaysUseAI || fullText.trim().length < 200) {
        console.log(`File ${fileData.name} appears to be scanned or requires AI. Using Gemini OCR...`);
        try {
            const res = await extractWithGemini(fileData.file, selectedMode, fileData.name);
            fields = res.fields;
            tokensUsed = res.tokens;
        } catch (error) {
            console.warn(`Gemini failed for ${fileData.name}, falling back to local extraction.`, error);
            fields = runLocalExtraction();
            fields.push({ key: "Aviso", value: "Extração local utilizada (Cota Gemini excedida ou erro)" });
        }
    } else {
        console.log(`Using local extraction for ${fileData.name}`);
        fields = runLocalExtraction();
    }

    if (fileData.shipmentId === "UNKNOWN" || !fileData.shipmentId) {
        const idMatch = fullText.match(/BSAO\d{7}/) || fullText.match(/DI\s*(\d{10})/);
        if (idMatch) fileData.shipmentId = idMatch[0];
    }
    
    if (tokensUsed > 0) {
        fields.push({ key: "Tokens Utilizados", value: tokensUsed.toString() });
    }

    return {
      fileId: fileData.id,
      fileName: fileData.name,
      shipmentId: fileData.shipmentId || "UNKNOWN",
      fields: fields,
      tokensUsed: tokensUsed
    };

  } catch (error) {
    console.error(`Error analyzing file ${fileData.name}:`, error);
    let errorMessage = "Could not read PDF text locally.";
    if (error instanceof Error) errorMessage += ` Details: ${error.message}`;

    return {
      fileId: fileData.id,
      fileName: fileData.name,
      shipmentId: fileData.shipmentId || "UNKNOWN",
      fields: [{ key: "Error", value: errorMessage }]
    };
  }
};