import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export function generatePayslipPDF(stream, employee, payroll) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(stream);

  doc.fontSize(18).text('Payslip', { align: 'center' });
  doc.moveDown();

  const employeeName = employee.name || (employee.personalDetails ? `${employee.personalDetails.firstName || ''} ${employee.personalDetails.lastName || ''}`.trim() : 'Employee');
  const city = employee.city || (employee.personalDetails ? (employee.personalDetails.city || 'N/A') : 'N/A');
  const generatedDate = new Date().toLocaleDateString('en-IN');

  doc.fontSize(12).text(`Employee: ${employeeName}`);
  doc.text(`City: ${city}`);
  doc.text(`Generated: ${generatedDate}`);
  doc.moveDown();

  const lines = [
    ['Gross Salary', payroll.gross_salary],
    ['PF (Employee)', payroll.pf_employee],
    ['ESI (Employee)', payroll.esic?.employee || 0],
    ['Tax (Chosen Regime)', Math.min(payroll.total_tax_old, payroll.total_tax_new)],
    ['Net Take Home', payroll.net_take_home],
  ];

  lines.forEach(([label, value]) => {
    const valFormatted = value != null ? `₹ ${Number(value).toLocaleString('en-IN')}` : 'N/A';
    doc.text(`${label}: ${valFormatted}`);
  });

  doc.end();
}

export async function generatePayslipExcel(workbook, employee, payroll) {
  const sheet = workbook.addWorksheet('Payslip');
  
  sheet.addRow(['Payslip']).font = { bold: true };
  sheet.addRow([]);

  const employeeName = employee.name || (employee.personalDetails ? `${employee.personalDetails.firstName || ''} ${employee.personalDetails.lastName || ''}`.trim() : 'Employee');
  const city = employee.city || (employee.personalDetails ? (employee.personalDetails.city || 'N/A') : 'N/A');
  const generatedDate = new Date().toLocaleDateString('en-IN');

  sheet.addRow(['Employee', employeeName]);
  sheet.addRow(['City', city]);
  sheet.addRow(['Generated', generatedDate]);
  sheet.addRow([]);

  const rows = [
    ['Gross Salary', payroll.gross_salary],
    ['PF (Employee)', payroll.pf_employee],
    ['ESI (Employee)', payroll.esic?.employee || 0],
    ['Tax (Chosen Regime)', Math.min(payroll.total_tax_old, payroll.total_tax_new)],
    ['Net Take Home', payroll.net_take_home],
  ];

  rows.forEach(row => sheet.addRow(row));
}
