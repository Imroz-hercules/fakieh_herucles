import ExcelJS from 'exceljs';

/** Color palette matching BatchHistoricalReports print/PDF layout. */
export const REPORT_EXCEL_COLORS = {
  TEAL: '0088A9',
  ERR_OK: '28A745',
  ERR_BAD: 'DC3545',
  TOTAL_BG: 'E8F4F8',
  FILTER_BG: 'F3FAFC',
  FILTER_BORDER: 'D6EEF4',
  ALT_ROW: 'F9F9F9',
  BATCH_BG: 'F7FBFD',
  WHITE: 'FFFFFF',
} as const;

export interface ReportExcelLogo {
  base64: string;
  extension: 'png' | 'jpeg' | 'gif';
}

export interface ReportExcelFilters {
  dateRange: string;
  products: string[];
  batches: string[];
  materials: string[];
  totalRecords: number;
}

export interface ReportExcelCellStyle {
  font?: Partial<ExcelJS.Font>;
  fill?: ExcelJS.Fill;
  alignment?: Partial<ExcelJS.Alignment>;
}

export interface FlatReportExcelOptions {
  title: string;
  headers: string[];
  rows: Record<string, unknown>[];
  mapCellValue: (item: Record<string, unknown>, header: string) => string;
  getCellStyle?: (header: string, value: string, item: Record<string, unknown>) => ReportExcelCellStyle | undefined;
  filters: ReportExcelFilters;
  logos: {
    hercules: ReportExcelLogo;
    fakieh: ReportExcelLogo;
    asm: ReportExcelLogo;
  };
  totalsCells?: { header: string; value: string }[];
  footerText?: string;
}

export interface DetailedReportRow {
  batchName?: string;
  productName?: string;
  productCode?: string;
  batchStart?: string;
  batchEnd?: string;
  batchQuantity?: string | number;
  materialName?: string;
  materialCode?: string;
  setPointFloat?: number;
  actualValueFloat?: number;
  errKg?: string | number;
  errPercent?: string | number;
  isTotal?: boolean;
}

export interface DetailedReportExcelOptions {
  title: string;
  groups: DetailedReportRow[][];
  formatBatchTime: (value: string) => string;
  filters: ReportExcelFilters;
  logos: FlatReportExcelOptions['logos'];
  grandTotalsCells?: { header: string; value: string }[];
  footerText?: string;
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
  left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
  bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
  right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
};

function solidFill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
}

function applyStyle(cell: ExcelJS.Cell, style?: ReportExcelCellStyle) {
  if (!style) return;
  if (style.font) cell.font = { ...cell.font, ...style.font };
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = { ...cell.alignment, ...style.alignment };
}

function errPercentStyle(value: string): ReportExcelCellStyle {
  const num = parseFloat(value);
  const color = !Number.isNaN(num) && num < 5 ? REPORT_EXCEL_COLORS.ERR_OK : REPORT_EXCEL_COLORS.ERR_BAD;
  return { font: { bold: true, color: { argb: `FF${color}` } }, alignment: { horizontal: 'right' } };
}

function addLogos(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  logos: FlatReportExcelOptions['logos'],
  colCount: number,
) {
  const herculesId = workbook.addImage({ base64: logos.hercules.base64, extension: logos.hercules.extension });
  const fakiehId = workbook.addImage({ base64: logos.fakieh.base64, extension: logos.fakieh.extension });
  const asmId = workbook.addImage({ base64: logos.asm.base64, extension: logos.asm.extension });

  worksheet.getRow(1).height = 48;
  worksheet.getRow(2).height = 8;

  const rightCol = Math.max(colCount - 1, 4);
  worksheet.addImage(herculesId, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 52 } });
  worksheet.addImage(fakiehId, { tl: { col: rightCol - 1, row: 0 }, ext: { width: 110, height: 48 } });
  worksheet.addImage(asmId, { tl: { col: rightCol, row: 0 }, ext: { width: 110, height: 48 } });

  worksheet.mergeCells(1, 1, 2, colCount);
  const logoCell = worksheet.getCell(1, 1);
  logoCell.border = {
    bottom: { style: 'medium', color: { argb: `FF${REPORT_EXCEL_COLORS.TEAL}` } },
  };
}

function writeHeaderSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  filters: ReportExcelFilters,
  colCount: number,
): number {
  let row = startRow;

  const titleCell = worksheet.getCell(row, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 17, color: { argb: `FF${REPORT_EXCEL_COLORS.TEAL}` } };
  worksheet.mergeCells(row, 1, row, colCount);
  row += 1;

  const genCell = worksheet.getCell(row, 1);
  genCell.value = `Generated on: ${new Date().toLocaleString()}`;
  genCell.font = { size: 10, color: { argb: 'FF555555' } };
  worksheet.mergeCells(row, 1, row, colCount);
  row += 2;

  const filterStart = row;
  worksheet.getCell(row, 1).value = 'Report Filters';
  worksheet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: `FF${REPORT_EXCEL_COLORS.TEAL}` } };
  worksheet.mergeCells(row, 1, row, colCount);
  row += 1;

  worksheet.getCell(row, 1).value = `Date Range: ${filters.dateRange}`;
  worksheet.mergeCells(row, 1, row, colCount);
  row += 1;

  if (filters.products.length > 0) {
    worksheet.getCell(row, 1).value = `Product: ${filters.products.join(', ')}`;
    worksheet.mergeCells(row, 1, row, colCount);
    row += 1;
  }
  if (filters.batches.length > 0) {
    worksheet.getCell(row, 1).value = `Batch: ${filters.batches.join(', ')}`;
    worksheet.mergeCells(row, 1, row, colCount);
    row += 1;
  }
  if (filters.materials.length > 0) {
    worksheet.getCell(row, 1).value = `Material: ${filters.materials.join(', ')}`;
    worksheet.mergeCells(row, 1, row, colCount);
    row += 1;
  }

  worksheet.getCell(row, 1).value = `Total Records: ${filters.totalRecords}`;
  worksheet.mergeCells(row, 1, row, colCount);
  row += 1;

  for (let r = filterStart; r < row; r += 1) {
    for (let c = 1; c <= colCount; c += 1) {
      const cell = worksheet.getCell(r, c);
      cell.fill = solidFill(REPORT_EXCEL_COLORS.FILTER_BG);
      cell.border = {
        left: { style: 'thin', color: { argb: `FF${REPORT_EXCEL_COLORS.FILTER_BORDER}` } },
        right: { style: 'thin', color: { argb: `FF${REPORT_EXCEL_COLORS.FILTER_BORDER}` } },
        top: r === filterStart ? { style: 'thin', color: { argb: `FF${REPORT_EXCEL_COLORS.FILTER_BORDER}` } } : undefined,
        bottom: r === row - 1 ? { style: 'thin', color: { argb: `FF${REPORT_EXCEL_COLORS.FILTER_BORDER}` } } : undefined,
      };
      cell.font = { ...cell.font, size: 10 };
    }
  }

  return row + 1;
}

function writeTableHeader(worksheet: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((header, idx) => {
    const cell = worksheet.getCell(row, idx + 1);
    cell.value = header.toUpperCase();
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = solidFill(REPORT_EXCEL_COLORS.TEAL);
    cell.border = thinBorder;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  worksheet.getRow(row).height = 22;
}

function autoColumnWidths(worksheet: ExcelJS.Worksheet, colCount: number, startRow: number, endRow: number) {
  for (let c = 1; c <= colCount; c += 1) {
    let maxLen = 10;
    for (let r = startRow; r <= endRow; r += 1) {
      const val = worksheet.getCell(r, c).value;
      const len = val == null ? 0 : String(val).length;
      maxLen = Math.max(maxLen, Math.min(len + 2, 40));
    }
    worksheet.getColumn(c).width = maxLen;
  }
}

function writeFooter(worksheet: ExcelJS.Worksheet, row: number, colCount: number, text: string) {
  const cell = worksheet.getCell(row, 1);
  cell.value = text;
  cell.font = { size: 9, color: { argb: 'FF666666' } };
  cell.alignment = { horizontal: 'center' };
  worksheet.mergeCells(row, 1, row, colCount);
}

/** Build a styled flat-table Excel workbook (matches print/PDF for non-detailed tabs). */
export async function buildFlatReportExcel(options: FlatReportExcelOptions): Promise<Blob> {
  const { headers, rows, mapCellValue, getCellStyle, filters, logos, totalsCells, footerText } = options;
  const colCount = Math.max(headers.length, 1);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(options.title.slice(0, 31));

  addLogos(workbook, worksheet, logos, colCount);

  const tableStartRow = writeHeaderSection(worksheet, 4, options.title, filters, colCount);
  writeTableHeader(worksheet, tableStartRow, headers);

  let dataRow = tableStartRow + 1;
  rows.forEach((item, rowIdx) => {
    headers.forEach((header, colIdx) => {
      const value = mapCellValue(item, header);
      const cell = worksheet.getCell(dataRow, colIdx + 1);
      cell.value = value;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
      if (rowIdx % 2 === 1) {
        cell.fill = solidFill(REPORT_EXCEL_COLORS.ALT_ROW);
      }
      applyStyle(cell, getCellStyle?.(header, value, item));
    });
    dataRow += 1;
  });

  if (totalsCells && totalsCells.length > 0) {
    headers.forEach((header, colIdx) => {
      const match = totalsCells.find((t) => t.header === header);
      const cell = worksheet.getCell(dataRow, colIdx + 1);
      cell.value = match?.value ?? '';
      cell.font = { bold: true };
      cell.fill = solidFill(REPORT_EXCEL_COLORS.TOTAL_BG);
      cell.border = thinBorder;
    });
    dataRow += 1;
  }

  writeFooter(
    worksheet,
    dataRow + 1,
    colCount,
    footerText ?? `Total Records: ${filters.totalRecords} | Generated by Fakieh Reporting`,
  );

  autoColumnWidths(worksheet, colCount, tableStartRow, dataRow);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Build Detailed Report Excel with merged batch column (matches print/PDF). */
export async function buildDetailedReportExcel(options: DetailedReportExcelOptions): Promise<Blob> {
  const headers = ['Batch', 'Material Name', 'Code', 'Set Point', 'Actual', 'Err Kg', 'Err %'];
  const colCount = headers.length;
  const { groups, formatBatchTime, filters, logos, grandTotalsCells, footerText } = options;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Detailed Report');

  addLogos(workbook, worksheet, logos, colCount);

  const tableStartRow = writeHeaderSection(worksheet, 4, options.title, filters, colCount);
  writeTableHeader(worksheet, tableStartRow, headers);

  let dataRow = tableStartRow + 1;

  groups.forEach((group) => {
    const batchRowSpan = Math.max(1, group.length - 1);
    const batchStartRow = dataRow;

    group.forEach((item, itemIndex) => {
      const isTotalRow = Boolean(item.isTotal);

      if (itemIndex === 0 && !isTotalRow) {
        const batchText = [
          `Batch: ${item.batchName || 'N/A'}`,
          `Product: ${item.productName || 'N/A'}`,
          `Product Code: ${item.productCode || 'N/A'}`,
          `Start: ${formatBatchTime(item.batchStart || 'N/A')}`,
          `End: ${formatBatchTime(item.batchEnd || 'N/A')}`,
          `Quantity: ${item.batchQuantity ?? 'N/A'}`,
        ].join('\n');
        const batchCell = worksheet.getCell(dataRow, 1);
        batchCell.value = batchText;
        batchCell.alignment = { vertical: 'top', wrapText: true };
        batchCell.fill = solidFill(REPORT_EXCEL_COLORS.BATCH_BG);
        batchCell.border = thinBorder;
        if (batchRowSpan > 1) {
          worksheet.mergeCells(batchStartRow, 1, batchStartRow + batchRowSpan - 1, 1);
        }
      } else if (isTotalRow) {
        worksheet.getCell(dataRow, 1).value = '';
        worksheet.getCell(dataRow, 1).border = thinBorder;
      }

      const materialCell = worksheet.getCell(dataRow, 2);
      materialCell.value = item.materialName || (isTotalRow ? 'Total' : '');
      materialCell.border = thinBorder;
      materialCell.alignment = { vertical: 'top', wrapText: true };

      const codeCell = worksheet.getCell(dataRow, 3);
      codeCell.value = item.materialCode || '';
      codeCell.border = thinBorder;

      const spCell = worksheet.getCell(dataRow, 4);
      spCell.value = item.setPointFloat != null ? item.setPointFloat.toFixed(2) : '-';
      spCell.border = thinBorder;
      spCell.alignment = { horizontal: 'right' };

      const actCell = worksheet.getCell(dataRow, 5);
      actCell.value = item.actualValueFloat != null ? item.actualValueFloat.toFixed(2) : '-';
      actCell.border = thinBorder;
      actCell.alignment = { horizontal: 'right' };

      const errKgCell = worksheet.getCell(dataRow, 6);
      errKgCell.value = item.errKg ?? '-';
      errKgCell.border = thinBorder;
      errKgCell.font = { bold: true };
      errKgCell.alignment = { horizontal: 'right' };

      const errPctCell = worksheet.getCell(dataRow, 7);
      const errPctVal = item.errPercent != null ? String(item.errPercent) : '-';
      errPctCell.value = errPctVal;
      errPctCell.border = thinBorder;
      if (errPctVal !== '-') {
        applyStyle(errPctCell, errPercentStyle(errPctVal));
      }

      if (isTotalRow) {
        for (let c = 1; c <= colCount; c += 1) {
          const cell = worksheet.getCell(dataRow, c);
          cell.fill = solidFill(REPORT_EXCEL_COLORS.TOTAL_BG);
          cell.font = { ...cell.font, bold: true };
        }
      }

      dataRow += 1;
    });
  });

  if (grandTotalsCells && grandTotalsCells.length > 0) {
    headers.forEach((header, colIdx) => {
      const match = grandTotalsCells.find((t) => t.header === header);
      const cell = worksheet.getCell(dataRow, colIdx + 1);
      cell.value = match?.value ?? '';
      cell.font = { bold: true };
      cell.fill = solidFill(REPORT_EXCEL_COLORS.TOTAL_BG);
      cell.border = thinBorder;
      if (header === 'Err %' && match?.value) {
        applyStyle(cell, errPercentStyle(match.value));
      }
    });
    dataRow += 1;
  }

  const totalItems = groups.reduce((sum, g) => sum + g.length, 0);
  writeFooter(
    worksheet,
    dataRow + 1,
    colCount,
    footerText ?? `Total Records: ${totalItems} | Generated by Fakieh Reporting`,
  );

  autoColumnWidths(worksheet, colCount, tableStartRow, dataRow);
  worksheet.getColumn(1).width = Math.max(worksheet.getColumn(1).width ?? 12, 28);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Rasterise an asset URL to PNG base64 for ExcelJS (handles WebP via canvas). */
export function loadLogoForExcel(imageUrl: string): Promise<ReportExcelLogo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] ?? '';
      resolve({ base64, extension: 'png' });
    };
    img.onerror = () => reject(new Error(`Failed to load logo: ${imageUrl}`));
    img.src = imageUrl;
  });
}

export function downloadExcelBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function excelFilename(tabName: string): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const tab = tabName.replace(/\s+/g, '_');
  return `${tab}_${dateStr}_${timeStr}.xlsx`;
}
