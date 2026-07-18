import ExcelJS from "exceljs";

interface CostEntry {
  id: number;
  name: string;
  amount: number | string;
  category: string;
  date: string;
  notes?: string | null;
}

export async function exportCostsToExcel(
  costs: CostEntry[],
  projectName: string
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("成本清单");

  // Header style
  const headerStyle = {
    font: { bold: true, color: { argb: "FFFFFFFF" }, size: 12 },
    fill: {
      type: "pattern" as const,
      pattern: "solid" as const,
      fgColor: { argb: "FF0EA5E9" },
    },
    alignment: { horizontal: "center" as const, vertical: "middle" as const },
  };

  // Title row
  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `${projectName} - 成本清单`;
  titleCell.font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  // Headers at row 3
  const headers = ["费用名称", "金额 (¥)", "类别", "日期", "备注"];
  const headerRow = sheet.getRow(3);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.alignment = headerStyle.alignment;
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  headerRow.height = 28;

  // Data rows
  costs.forEach((cost, idx) => {
    const row = sheet.getRow(idx + 4);
    row.getCell(1).value = cost.name;
    row.getCell(2).value = parseFloat(String(cost.amount));
    row.getCell(2).numFmt = "¥#,##0.00";
    row.getCell(3).value = cost.category;
    row.getCell(4).value = new Date(cost.date).toLocaleDateString("zh-CN");
    row.getCell(5).value = cost.notes || "";

    // Style
    row.eachCell(cell => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle" };
    });
  });

  // Summary row
  const summaryRow = sheet.getRow(costs.length + 5);
  sheet.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
  summaryRow.getCell(1).value = "合计";
  summaryRow.getCell(1).font = { bold: true };
  summaryRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  summaryRow.getCell(2).value = costs.reduce(
    (sum, c) => sum + parseFloat(String(c.amount)),
    0
  );
  summaryRow.getCell(2).numFmt = "¥#,##0.00";
  summaryRow.getCell(2).font = { bold: true, color: { argb: "FF0EA5E9" } };
  summaryRow.eachCell(cell => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Column widths
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 15;
  sheet.getColumn(5).width = 30;

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}-成本清单-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
