
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Enhanced Print Utility for SNA! Mobile ERP
 * Uses a dedicated popup window to ensure exact style reproduction and avoid main-thread rendering conflicts.
 */

export const printSection = (selector: string, callback?: () => void) => {
  const element = document.querySelector(selector);
  
  if (!element) {
    console.warn(`Print Error: Target element not found. Selector: ${selector}`);
    return;
  }

  // Open a new window
  const printWindow = window.open('', '_blank', 'height=800,width=600,menubar=no,toolbar=no,location=no,status=no,titlebar=no');
  
  if (!printWindow) {
    alert('Pop-up blocked! Please allow pop-ups for this site to print receipts.');
    return;
  }

  // Get content
  const content = element.innerHTML;

  // Construct the document
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Print Receipt - SNA! Mobile ERP</title>
        <!-- Re-inject Tailwind -->
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- Re-inject Fonts -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
        <style>
          body { 
            font-family: 'Inter', sans-serif;
            background: white;
            padding: 20px;
            color: black;
          }
          
          /* Thermal Mode specific styling */
          .receipt-mode {
             font-family: 'Courier New', Courier, monospace;
             width: 100%;
             max-width: 80mm; /* Standard thermal width */
             margin: 0 auto;
          }

          /* A4 Mode specific styling */
          .receipt-a4-mode {
             width: 100%;
             max-width: 210mm;
             margin: 0 auto;
          }
          
          /* Barcode and QR sizing fixes */
          svg, img { max-width: 100%; height: auto; }
          
          @media print {
            @page { margin: 0; size: auto; }
            body { padding: 0; margin: 0; }
            .no-print { display: none !important; }
            /* Force background graphics for proper visual fidelity */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        <div id="print-wrapper">
          ${content}
        </div>
        <script>
          // Auto-print logic
          // We wait slightly for Tailwind to parse the classes
          window.onload = () => {
             setTimeout(() => {
               window.focus();
               window.print();
               // Automatically close the window after print dialog is dismissed (Print or Cancel)
               window.close(); 
             }, 800);
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
  
  if (callback) callback();
};

export const exportSectionToPDF = async (selector: string, filename: string = 'SNA_Export.pdf') => {
  const element = document.querySelector(selector) as HTMLElement;
  if (!element) return;

  document.body.style.cursor = 'wait';

  try {
    const isThermal = element.classList.contains('receipt-mode') || selector.includes('receipt');
    const isA4 = element.classList.contains('receipt-a4-mode');
    
    // Use html2canvas to capture the element as an image
    const canvas = await html2canvas(element, {
      scale: 2, // Slightly lower scale for better performance on mobile
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    
    // Determine PDF format based on content type
    const pdf = (isThermal && !isA4) 
      ? new jsPDF({ orientation: 'p', unit: 'mm', format: [80, 297] }) // 80mm width, long height for thermal
      : new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    // Calculate dimensions to fit width
    const contentWidthMm = (isThermal && !isA4) ? 72 : pageWidth - 20; 
    const contentHeightMm = (canvas.height * contentWidthMm) / canvas.width;

    const x = (pageWidth - contentWidthMm) / 2;
    // Add image to PDF
    pdf.addImage(imgData, 'PNG', x, 5, contentWidthMm, contentHeightMm, undefined, 'FAST');
    pdf.save(filename);
  } catch (error) {
    console.error('PDF Export failed:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    document.body.style.cursor = 'default';
  }
};
