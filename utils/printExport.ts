
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

  // Create a hidden iframe to avoid popup-blocker and focus issues
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px'; // Position it far off-screen
  iframe.style.left = '-10000px';
  iframe.style.width = '1px'; // Give it minimal dimensions
  iframe.style.height = '1px';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error("Could not access iframe document for printing.");
    document.body.removeChild(iframe);
    return;
  }

  // Get content
  const content = element.innerHTML;

  // Get all stylesheets from the main document to inject them into the iframe
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(el => el.outerHTML)
    .join('\n');

  // Construct the document inside the iframe
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Print - SNA! Mobile ERP</title>
        ${styles}
        <style>
          body { 
            font-family: 'Inter', sans-serif; /* Fallback font */
            background: white; /* Ensure white background for printing */
            color: black;
            margin: 0;
            padding: 0;
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
            @page { 
              margin: 0.24in !important; 
              size: auto; 
            }
            body { padding: 0 !important; margin: 0 !important; }
            .no-print { display: none !important; }
            /* Force background graphics for proper visual fidelity */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }

          /* Fix for tfoot repeating on every page */
          tfoot {
            display: table-row-group;
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `);
  iframeDoc.close();

  iframe.contentWindow.onload = function () {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Printing failed:", e);
      alert("Could not open print dialog. Please check browser settings.");
    } finally {
      // Clean up the iframe after a delay to allow the print dialog to open.
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    }
  };

  if (callback) callback();
};

export const exportSectionToPDF = async (selector: string, filename: string = 'SNA_Export.pdf') => {
  let element;
  try {
    element = document.querySelector(selector) as HTMLElement;
  } catch (e) {
    console.error("PDF Export Error: Invalid selector passed", selector);
    return;
  }
  if (!element) {
    console.warn(`PDF Export Error: Target element not found. Selector: ${selector}`);
    return;
  }

  document.body.style.cursor = 'wait';

  try {
    const isA4 = element.classList.contains('receipt-a4-mode');

    // Use html2canvas to capture the element as an image
    const canvas = await html2canvas(element, {
      scale: 2, // Slightly lower scale for better performance on mobile
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      // These properties help capture content beyond the visible viewport
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');

    if (isA4) {
      // Multi-page A4 logic
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const margin = 6; // ~0.24 inches
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const usableWidth = pdfWidth - (margin * 2);
      const usableHeight = pdfHeight - (margin * 2);

      const imgHeight = (canvas.height * usableWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imgHeight);
      heightLeft -= usableHeight;

      while (heightLeft > 0) {
        position = -heightLeft + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, usableWidth, imgHeight);
        heightLeft -= usableHeight;
      }

      // Add page numbers to the footer
      const pageCount = (pdf.internal as any).getNumberOfPages();
      if (pageCount > 1) { // Only add if there are multiple pages
        for (let i = 1; i <= pageCount; i++) {
          pdf.setPage(i);
          pdf.setFontSize(8);
          // Set the font for the page numbers. Options: 'helvetica', 'courier', 'times'
          pdf.setFont('courier', 'bold');
          pdf.setTextColor(150); // A soft gray color
          pdf.text(
            `Page ${i} of ${pageCount}`,
            pdf.internal.pageSize.getWidth() / 2, // Center horizontally
            pdf.internal.pageSize.getHeight() - 5, // 5mm from the bottom
            { align: 'center' }
          );
        }
      }

      pdf.save(filename);
    } else {
      // Logic for single-page or thermal prints
      const isThermal = element.classList.contains('receipt-mode');

      if (isThermal) {
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: [80, 297] });
        const thermalMargin = 4; // 4mm margin for 72mm content on 80mm paper
        const contentWidthMm = 80 - (thermalMargin * 2);
        const contentHeightMm = (canvas.height * contentWidthMm) / canvas.width;
        pdf.addImage(imgData, 'PNG', thermalMargin, thermalMargin, contentWidthMm, contentHeightMm, undefined, 'FAST');
        pdf.save(filename);
      } else {
        // Standard A4 single page, scaled to fit
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const margin = 6; // Standard ~0.24 inch margin
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const usableWidth = pdfWidth - (margin * 2);
        const usableHeight = pdfHeight - (margin * 2);

        let imgWidth = usableWidth;
        let imgHeight = (canvas.height * imgWidth) / canvas.width;

        // If the content is too high, scale it down to fit the page
        if (imgHeight > usableHeight) {
          imgHeight = usableHeight;
          imgWidth = (canvas.width * imgHeight) / canvas.height;
        }

        // Center the image horizontally within the usable area
        const x = margin + (usableWidth - imgWidth) / 2;
        const y = margin;

        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');
        pdf.save(filename);
      }
    }
  } catch (error) {
    console.error('PDF Export failed:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    document.body.style.cursor = 'default';
  }
};
