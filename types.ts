export interface FileData {
  id: string;
  file: File;
  name: string;
  shipmentId: string | null;
}

export interface ExtractedField {
  key: string;
  value: string | number;
}

export interface FileExtractionResult {
  fileId: string;
  fileName: string;
  shipmentId: string;
  fields: ExtractedField[];
  tokensUsed?: number;
}
