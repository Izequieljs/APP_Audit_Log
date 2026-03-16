import * as XLSX from 'xlsx';
import { FileExtractionResult } from '../types';

export const generateExcelReport = (results: FileExtractionResult[], tolerance: number = 0, baseFileName: string = "Relatorio") => {
  const wb = XLSX.utils.book_new();

  // Helper to determine sheet name based on file content/name analysis
  const getSheetName = (res: FileExtractionResult): string => {
    const upperName = res.fileName.toUpperCase();
    
    // Check if filename contains "VESTAS" and use the part after it
    const vestasMatch = upperName.match(/VESTAS\s+(.+?)(?:\.PDF)?$/i);
    if (vestasMatch && vestasMatch[1]) {
        return vestasMatch[1].trim().substring(0, 30);
    }

    // 1. PC (Prestação de Contas)
    // Check filename ending or specific PC fields
    if (upperName.endsWith("PC.PDF") || res.fields.some(f => f.key === "Desconsolidação" || f.key === "Taxa SISCOMEX")) {
        return "PC";
    }

    // 2. APM
    if (upperName.includes("APM") || upperName.includes("TERM")) return "APM TERM";
    const hasApmField = res.fields.some(f => f.key === "CNPJ Prestador" && f.value === "05.388.226/0001-25");
    if (hasApmField) return "APM TERM";

    // 3. DI
    if (/\bDI\b/.test(upperName) || upperName.includes("DECLARACAO")) return "DI";
    if (res.fields.some(f => f.key === "Número DI")) return "DI";

    // 4. ICMS
    if (upperName.includes("ICMS") || upperName.includes("GARE") || upperName.includes("DAE")) return "ICMS";
    if (res.fields.some(f => f.key === "Valor Total a Recolher")) return "ICMS";

    // 5. NF (General Service Notes)
    if (upperName.includes("NF") || upperName.includes("NOTA") || upperName.includes("PREMA") || upperName.includes("DSV")) return "NF";
    if (res.fields.some(f => f.key === "Prestador")) return "NF";
    
    // 6. PACKING LIST
    if (res.fields.some(f => f.key === "Consignee" || f.key === "Ship-to party")) return "PACKING LIST";

    // Fallback
    let cleanName = res.fileName.replace(/\.pdf$/i, '').replace(/[\\/*[\]:?]/g, '_');
    return cleanName.substring(0, 30);
  };

  // Group results by their target sheet name
  const groupedData: Record<string, FileExtractionResult[]> = {};

  results.forEach(res => {
    let sheetName = getSheetName(res);
    if (!groupedData[sheetName]) {
        groupedData[sheetName] = [];
    }
    groupedData[sheetName].push(res);
  });

  // 1. Prepare "Consolidado" data
  const consolidadoRows: any[] = [];
  results.forEach(res => {
      res.fields.forEach(field => {
          consolidadoRows.push({
              "ID Processo": res.shipmentId || "N/A",
              "Arquivo Origem": res.fileName,
              "Aba Destino": getSheetName(res),
              "Campo": field.key,
              "Valor": field.value,
              "Tokens Utilizados": res.tokensUsed || 0
          });
      });
  });

  // 2. Prepare "Conferência Cruzada" data
  const pcFiles = results.filter(r => getSheetName(r) === "PC");
  const otherFiles = results.filter(r => getSheetName(r) !== "PC");
  let wsCross: XLSX.WorkSheet | null = null;
  
  // Track matched PC fields: Map<string, { details: string[], usedTolerance: boolean }> where key is `${pcFile.fileName}|${pcField.key}`
  const matchedPcDetails = new Map<string, { details: string[], usedTolerance: boolean }>();

  // Helper to normalize values for comparison (e.g. "R$ 5.325,56" -> "5.325,56")
  const normalizeValue = (v: any) => {
      if (!v) return "";
      return String(v).replace(/[R$\s]/g, '').trim();
  };

  const parseNumber = (v: string) => {
      // Convert Brazilian format "1.234,56" to "1234.56"
      const clean = v.replace(/\./g, '').replace(',', '.');
      return parseFloat(clean);
  };

  if (pcFiles.length > 0 && otherFiles.length > 0) {
      const crossRows: any[] = [];

      pcFiles.forEach(pcFile => {
          pcFile.fields.forEach(pcField => {
              // Normalize value for comparison
              const val = String(pcField.value).trim();
              const normVal = normalizeValue(val);
              
              // Skip low-value fields to minimize noise
              if (!normVal || normVal === "0,00" || normVal === "0" || normVal === "0,0") return;

              // Skip Master and Processo if they are "-"
              if ((pcField.key.toUpperCase().includes("MASTER") || pcField.key.toUpperCase().includes("PROCESSO")) && val === "-") return;

              const isCompField = pcField.key.toUpperCase().includes("ARMAZENAGEM") || pcField.key.toUpperCase().includes("DAPE SERVIÇOS") || pcField.key.toUpperCase().includes("DAPE SERVICOS");

              otherFiles.forEach(otherFile => {
                  // If it's a COMP field, only compare with files that have COMP in the name
                  if (isCompField && !otherFile.fileName.toUpperCase().includes("COMP")) {
                      return;
                  }

                  otherFile.fields.forEach(otherField => {
                      const otherVal = String(otherField.value).trim();
                      const normOtherVal = normalizeValue(otherVal);
                      
                      let isMatch = false;
                      let neededTolerance = false;
                      
                      if (normOtherVal !== "" && normVal !== "") {
                          if (normOtherVal === normVal) {
                              isMatch = true;
                          } else if (tolerance > 0) {
                              const numVal = parseNumber(normVal);
                              const numOtherVal = parseNumber(normOtherVal);
                              if (!isNaN(numVal) && !isNaN(numOtherVal)) {
                                  // Use small epsilon for float precision
                                  if (Math.abs(numVal - numOtherVal) <= tolerance + 0.0001) {
                                      isMatch = true;
                                      neededTolerance = true;
                                  }
                              }
                          }
                      }
                      
                      // Match normalized values
                      if (isMatch) {
                          const matchKey = `${pcFile.fileName}|${pcField.key}`;
                          if (!matchedPcDetails.has(matchKey)) {
                              matchedPcDetails.set(matchKey, { details: [], usedTolerance: false });
                          }
                          const matchData = matchedPcDetails.get(matchKey)!;
                          matchData.details.push(`${otherFile.fileName} / ${otherField.key}`);
                          if (neededTolerance) {
                              matchData.usedTolerance = true;
                          }

                          crossRows.push({
                              "ID Processo": pcFile.shipmentId,
                              "Valor Cruzado": val,
                              "Origem (PC) - Campo": pcField.key,
                              "Origem (PC) - Arquivo": pcFile.fileName,
                              "Destino - Arquivo": otherFile.fileName,
                              "Destino - Tipo": getSheetName(otherFile),
                              "Destino - Campo": otherField.key
                          });
                      }
                  });
              });
          });
      });

      if (crossRows.length > 0) {
          wsCross = XLSX.utils.json_to_sheet(crossRows);
          wsCross['!cols'] = [
            { wch: 15 }, // ID
            { wch: 15 }, // Valor
            { wch: 30 }, // Campo PC
            { wch: 40 }, // Arq PC
            { wch: 40 }, // Arq Dest
            { wch: 15 }, // Tipo
            { wch: 30 }  // Campo Dest
          ];
      }
  }

  // Helper to create and append a group sheet
  const appendGroupSheet = (sheetName: string) => {
      const groupFiles = groupedData[sheetName];
      if (!groupFiles) return;

      let allRows: any[] = [];
      let anyToleranceUsed = false;
      groupFiles.forEach(res => {
          res.fields.forEach(field => {
              const row: any = {
                  "ID Processo": res.shipmentId || "N/A",
                  "Arquivo Origem": res.fileName,
                  "Campo": field.key,
                  "Valor": field.value
              };

              if (sheetName === "PC") {
                  const val = String(field.value).trim();
                  // Check if it's a non-zero numeric/currency value
                  const cleanVal = val.replace(/[R$\s]/g, '');
                  const isNumeric = /^[\d\.,]+$/.test(cleanVal);
                  const isZero = cleanVal === "0,00" || cleanVal === "0" || cleanVal === "0,0";
                  
                  if (isNumeric && !isZero) {
                      const matchKey = `${res.fileName}|${field.key}`;
                      const matchData = matchedPcDetails.get(matchKey);
                      if (matchData && matchData.details.length > 0) {
                          row["Status Cruzamento"] = "Localizado";
                          row["Arquivo/Campo/Qtde."] = `(${matchData.details.length} enc.) ${Array.from(new Set(matchData.details)).join(" | ")}`;
                          if (matchData.usedTolerance) {
                              row["Tolerância Utilizada"] = `Sim (R$ ${tolerance})`;
                              anyToleranceUsed = true;
                          }
                      } else {
                          row["Status Cruzamento"] = "Não Localizado";
                          row["Arquivo/Campo/Qtde."] = "-";
                      }
                  } else {
                      row["Status Cruzamento"] = "-";
                      row["Arquivo/Campo/Qtde."] = "-";
                  }
              }

              allRows.push(row);
          });
      });

      const ws = XLSX.utils.json_to_sheet(allRows);
      
      const cols = [
        { wch: 15 }, // ID Processo
        { wch: 40 }, // Arquivo Origem
        { wch: 35 }, // Campo
        { wch: 50 }  // Valor
      ];

      if (sheetName === "PC") {
          cols.push({ wch: 20 }); // Status Cruzamento
          cols.push({ wch: 50 }); // Arquivo/Campo/Qtde.
          if (anyToleranceUsed) {
              cols.push({ wch: 20 }); // Tolerância Utilizada
          }
      }

      ws['!cols'] = cols;

      let finalSheetName = sheetName;
      let counter = 1;
      while (wb.SheetNames.includes(finalSheetName)) {
        finalSheetName = `${sheetName} (${counter})`;
        counter++;
      }

      XLSX.utils.book_append_sheet(wb, ws, finalSheetName);
  };

  // 3. Append sheets in the requested order
  
  if (results.length === 1) {
      // Only one file processed, just append its specific sheet
      const singleSheetName = getSheetName(results[0]);
      appendGroupSheet(singleSheetName);
  } else {
      // Multiple files processed
      // First: PC
      if (groupedData["PC"]) {
          appendGroupSheet("PC");
      }

      // Second: Conferência Cruzada
      if (wsCross) {
          XLSX.utils.book_append_sheet(wb, wsCross, "Conferência Cruzada");
      }

      // Third: Consolidado
      if (consolidadoRows.length > 0) {
          const wsConsolidado = XLSX.utils.json_to_sheet(consolidadoRows);
          wsConsolidado['!cols'] = [
            { wch: 15 }, // ID Processo
            { wch: 40 }, // Arquivo Origem
            { wch: 20 }, // Aba Destino
            { wch: 35 }, // Campo
            { wch: 50 }, // Valor
            { wch: 20 }  // Tokens Utilizados
          ];
          XLSX.utils.book_append_sheet(wb, wsConsolidado, "Consolidado");
      }
      
      // DO NOT append other sheets
  }

  // Format date as DD-MM-YYYY
  const date = new Date();
  const dateString = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;

  const fileName = `${baseFileName}_${dateString}.xlsx`;

  XLSX.writeFile(wb, fileName);
};