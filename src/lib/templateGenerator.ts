import * as XLSX from 'xlsx';

export function downloadExcelTemplate() {
  const wb = XLSX.utils.book_new();

  // Facts sheet with example rows
  const factsData = [
    ['DATE', 'ID_SOURCE', 'SOURCE_VL'],
    [new Date(2024, 0, 1), 'Savings Account', 15000],
    [new Date(2024, 0, 1), 'ETF World', 25000],
    [new Date(2024, 1, 1), 'Savings Account', 15100],
    [new Date(2024, 1, 1), 'ETF World', 25400],
  ];
  const factsSheet = XLSX.utils.aoa_to_sheet(factsData);
  factsSheet['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, factsSheet, 'facts');

  // Ref sheet with both reference tables
  const refData: any[][] = [
    ['ID_SOURCE', 'ID_VOLAT_TYPE', 'IS_CRYPTO', 'TRANSFERABLE_IN_DAYS'],
    ['Savings Account', 1, false, true],
    ['ETF World', 2, false, true],
    [],
    [],
    ['ID_VOLAT_TYPE', 'VOLAT_TYPE_DSC'],
    [1, 'Non-Volatile'],
    [2, 'Volatile'],
    [3, 'Highly Volatile'],
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refData);
  refSheet['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'ref');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'portfolio_template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
