import ExcelJS from 'exceljs';
export type ExportScope = 'personal' | 'group' | 'both';
export type ExportStatus = 'all' | 'settled' | 'unsettled';
export interface ExportFilters {
    scope: ExportScope;
    groupId?: string;
    from?: string;
    to?: string;
    month?: number;
    year?: number;
    categoryId?: string;
    status?: ExportStatus;
}
export interface ExportResult {
    workbook: ExcelJS.Workbook;
    filename: string;
    expenseCount: number;
}
export declare const buildExportWorkbook: (userId: string, userName: string, filters: ExportFilters) => Promise<ExportResult>;
