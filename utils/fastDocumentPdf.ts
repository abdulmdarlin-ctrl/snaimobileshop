import { jsPDF } from 'jspdf';
import defaultLogo from '../assets/SNAI-LOGO.png';

type Pair = [string, string];
type Snapshot = {
    kind: string; a4: boolean; width: number; font: string; size: number; leading: number;
    business: string[]; title: string; meta: Pair; customer: string[]; headers: string[];
    rows: { cells: string[]; serials: string[] }[]; lineSum: string; subtotal: string[]; pairs: Pair[]; total: string[];
    footer: string; footerSize: number; footerStyle: string; footerAlign: 'left' | 'center' | 'right'; logoKey: string;
};
type Command = { type: 'text'; value: string; x: number; y: number; size: number; style: string; align: 'left' | 'center' | 'right' } | { type: 'line'; y: number } | { type: 'logo'; y: number; box: number };
type Block = { height: number; commands: Command[]; table?: boolean; keep?: boolean };
type Logo = { data: string; width: number; height: number };
const cache = new WeakMap<HTMLElement, { signature: string; blob: Blob }>();
const logos = new Map<string, Logo>();
const mm = 25.4 / 72;
const text = (element?: Element | null) => (element?.textContent || '').replace(/\u00a0/g, ' ').normalize('NFC').trim();
const allText = (element: Element, selector: string) => Array.from(element.querySelectorAll(selector)).map(text);
export const supportsPdfText = (value: string) => /^[\x09-\x0d\x20-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/.test(value);

/** Read only the document already shown, preserving its selected payment and calculated totals. */
function snapshot(element: HTMLElement): Snapshot | null {
    const kind = element.dataset.documentKind;
    if (!element.classList.contains('sale-document-reference') || !['invoice', 'receipt'].includes(kind || '')) return null;
    const style = getComputedStyle(element), pixels = parseFloat(style.fontSize) || 11;
    const family = style.fontFamily.toLowerCase();
    const footer = element.querySelector<HTMLElement>('.document-footer');
    const footerStyle = footer ? getComputedStyle(footer) : null;
    const image = element.querySelector<HTMLImageElement>('.document-business-logo');
    const pairs: Pair[] = Array.from(element.querySelectorAll('.document-adjustments dt, .document-payment-details dt')).map(label => [text(label), text(label.nextElementSibling)]);
    const data: Snapshot = {
        kind: kind!, a4: element.classList.contains('receipt-a4-mode'), width: element.dataset.paperWidth === '58' ? 58 : 80,
        font: /mono|courier/.test(family) ? 'courier' : /georgia|times|serif/.test(family.replace('sans-serif', '')) ? 'times' : 'helvetica',
        size: pixels * .75, leading: (parseFloat(style.lineHeight) || pixels * 1.45) / pixels,
        business: allText(element, '.document-business h2, .document-business p'), title: text(element.querySelector('.document-title')),
        meta: [text(element.querySelector('.document-meta time')), text(element.querySelector('.document-meta > span'))],
        customer: allText(element, '.document-customer h2, .document-customer p'),
        headers: allText(element, '.document-items th, .document-payment th'),
        rows: Array.from(element.querySelectorAll('.document-items tbody tr, .document-payment tbody tr')).map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            return { cells: cells.map((cell, index) => index === 0 ? text(cell.querySelector('span') || cell) : text(cell)), serials: allText(row, 'small') };
        }),
        lineSum: text(element.querySelector('.document-line-sum')), subtotal: allText(element, '.document-subtotal > span'), pairs,
        total: allText(element, '.document-grand-total > span, .document-grand-total > strong'),
        footer: text(footer), footerSize: (parseFloat(footerStyle?.fontSize || '') || pixels) * .75,
        footerStyle: `${parseInt(footerStyle?.fontWeight || '400') >= 600 ? 'bold' : ''}${footerStyle?.fontStyle === 'italic' ? 'italic' : ''}` || 'normal',
        footerAlign: ['left', 'right'].includes(footerStyle?.textAlign || '') ? footerStyle!.textAlign as 'left' | 'right' : 'center',
        logoKey: image ? `${image.currentSrc || image.src}:${image.naturalWidth}` : ''
    };
    // Other scripts retain the existing browser-font renderer instead of losing characters.
    return data.title && data.meta[1] && data.total.length === 2 && supportsPdfText(JSON.stringify({ ...data, logoKey: '' })) ? data : null;
}
export const afterPdfPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));

function rasterLogo(image: HTMLImageElement): Logo | undefined {
    if (!image.complete || !image.naturalWidth) return;
    const key = image.currentSrc || image.src;
    if (logos.has(key)) return logos.get(key);
    try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 192 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d'); if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const logo = { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
        if (logos.size >= 4) logos.delete(logos.keys().next().value!);
        logos.set(key, logo); return logo;
    } catch { return; }
}
async function prepareLogo(element: HTMLElement): Promise<Logo | undefined> {
    const image = element.querySelector<HTMLImageElement>('.document-business-logo');
    if (!image) return;
    const ready = rasterLogo(image); if (ready) return ready;
    // Never wait for a remote logo to time out; use the bundled shop logo if it is still loading.
    const fallbackKey = new URL(defaultLogo, document.baseURI).href;
    if (logos.has(fallbackKey)) return logos.get(fallbackKey);
    return new Promise(resolve => {
        const fallback = new Image();
        const finish = () => { clearTimeout(timer); fallback.onload = null; fallback.onerror = null; resolve(rasterLogo(fallback)); };
        const timer = setTimeout(finish, 1200);
        fallback.onload = finish; fallback.onerror = finish; fallback.src = defaultLogo;
    });
}
function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none'; document.body.appendChild(link);
    link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function createPdf(data: Snapshot, logo?: Logo): Promise<Blob> {
    const width = data.a4 ? 210 : data.width, margin = data.a4 ? 8 : 3, content = width - margin * 2;
    const measure = new jsPDF({ unit: 'mm', format: [width, data.a4 ? 297 : 3000], putOnlyUsedFonts: true });
    const blocks: Block[] = [], size = data.size;
    function lines(value: string, pointSize: number, maximum = content, style = 'normal'): string[] {
        measure.setFont(data.font, style); measure.setFontSize(pointSize);
        return measure.splitTextToSize(value, Math.max(1, maximum));
    }
    function write(value: string, pointSize = size, style = 'normal', align: 'left' | 'center' | 'right' = 'left', gap = 0, table = false, keep = false) {
        const parts = lines(value, pointSize, content, style), height = pointSize * mm * data.leading;
        parts.forEach((part, index) => blocks.push({ height: height + (index === parts.length - 1 ? gap : 0), table, keep,
            commands: [{ type: 'text', value: part, x: align === 'center' ? width / 2 : align === 'right' ? width - margin : margin, y: pointSize * mm * .85, size: pointSize, style, align }] }));
    }
    const space = (height: number) => blocks.push({ height, commands: [] });
    const rule = (gap = 2) => blocks.push({ height: gap, commands: [{ type: 'line', y: 0 }] });
    function pair(left: string, right: string, pointSize = size, bold = false, gap = 1) {
        const style = bold ? 'bold' : 'normal'; measure.setFont(data.font, style); measure.setFontSize(pointSize);
        if (measure.getTextWidth(left) + measure.getTextWidth(right) + 3 <= content) {
            blocks.push({ height: pointSize * mm * data.leading + gap, commands: [
                { type: 'text', value: left, x: margin, y: pointSize * mm * .85, size: pointSize, style, align: 'left' },
                { type: 'text', value: right, x: width - margin, y: pointSize * mm * .85, size: pointSize, style, align: 'right' }] });
        } else { write(left, pointSize, style); write(right, pointSize, style, 'right', gap); }
    }
    const ratios = data.kind === 'invoice' ? [.38, .14, .23, .25] : [.48, .52];
    function row(cells: string[], pointSize: number, padding: number, table = true): Block {
        const commands: Command[] = []; let maxHeight = 0, x = margin;
        cells.forEach((cell, index) => {
            const columnWidth = content * ratios[index], right = data.kind === 'invoice' ? index >= 2 : index === 1;
            measure.setFont(data.font, 'normal'); measure.setFontSize(pointSize);
            const measured = measure.getTextWidth(cell);
            const actualSize = right && measured > columnWidth - 1 ? Math.max(5, pointSize * (columnWidth - 1) / measured) : pointSize;
            const wrapped = lines(cell, actualSize, columnWidth - (right ? 1 : 2));
            const height = actualSize * mm * data.leading; maxHeight = Math.max(maxHeight, height * wrapped.length);
            wrapped.forEach((value, i) => commands.push({ type: 'text', value, x: right ? x + columnWidth : x, y: padding + actualSize * mm * .85 + i * height, size: actualSize, style: 'normal', align: right ? 'right' : 'left' }));
            x += columnWidth;
        });
        return { height: maxHeight + padding * 2, commands, table };
    }
    if (logo) { const box = data.width === 58 && !data.a4 ? 15 : 18; blocks.push({ height: box + 2, commands: [{ type: 'logo', y: 0, box }], keep: true }); }
    data.business.forEach((value, index) => write(value, size * (index ? .95 : 1.25), index ? 'normal' : 'bold', 'center', index ? 1 : 1.5, false, true));
    space(2); rule(3); write(data.title, size * 1.65, 'bold', 'center', 4, false, true);
    pair(data.meta[0], data.meta[1], size * .94); space(1); rule(3);
    data.customer.forEach((value, index) => write(value, size * (index ? 1 : 1.08), 'normal', 'left', 1, false, index === 0));
    space(2); rule(0);
    const tableHeader = row(data.headers, size, 2.5, false); tableHeader.keep = true;
    const headerRule: Block = { height: 0, commands: [{ type: 'line', y: 0 }] };
    blocks.push(tableHeader, headerRule);
    for (let index = 0; index < data.rows.length; index++) {
        const entry = data.rows[index]; blocks.push(row(entry.cells, size * .95, 4));
        for (const serial of entry.serials) write(serial, size * .76, 'normal', 'left', 1, true);
        rule(0); blocks[blocks.length - 1].table = true;
        if (index && index % 30 === 0) await afterPdfPaint();
    }
    if (data.lineSum) { space(2); write(data.lineSum, size, 'bold', 'right', 2); rule(3); }
    if (data.subtotal.length) { pair(data.subtotal[0], data.subtotal[1] || '', size, false, 3); rule(3); }
    if (data.kind === 'receipt' && data.pairs.length) space(3);
    for (const [label, value] of data.pairs) pair(label, value);
    if (data.pairs.length) { space(2); rule(3); }
    write(`${data.total[0]}  ${data.total[1]}`, size * (data.kind === 'invoice' ? 1.55 : 1.3), 'normal', 'center', 3); rule(3);
    if (data.footer) write(data.footer, data.footerSize, data.footerStyle, data.footerAlign);
    const height = data.a4 ? 297 : Math.max(width, Math.min(3000, blocks.reduce((sum, block) => sum + block.height, 0) + margin * 2));
    const pdf = new jsPDF({ unit: 'mm', format: [width, height], compress: true, putOnlyUsedFonts: true });
    pdf.setProperties({ title: `${data.title} ${data.meta[1]}`, creator: 'Sna! Mobile Shop' });
    pdf.setDrawColor(0); pdf.setTextColor(0); pdf.setLineWidth(.2); pdf.setLineDashPattern([1.7, 1.2], 0);
    let y = margin;
    function draw(block: Block) {
        for (const command of block.commands) {
            if (command.type === 'text') { pdf.setFont(data.font, command.style); pdf.setFontSize(command.size); pdf.text(command.value, command.x, y + command.y, { align: command.align }); }
            else if (command.type === 'line') pdf.line(margin, y + command.y, width - margin, y + command.y);
            else if (logo) { const scale = Math.min(command.box / logo.width, command.box / logo.height), w = logo.width * scale, h = logo.height * scale; pdf.addImage(logo.data, 'PNG', (width - w) / 2, y + command.y + (command.box - h) / 2, w, h, 'business-logo', 'FAST'); }
        }
        y += block.height;
    }
    for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        let next = index + 1; while (next < blocks.length && blocks[next].height === 0) next++;
        const needed = block.height + (block.keep ? blocks[next]?.height || 0 : 0);
        if (y + needed > height - margin && y > margin) {
            pdf.addPage([width, height]); pdf.setLineDashPattern([1.7, 1.2], 0); y = margin;
            if (block.table) { draw(tableHeader); draw(headerRule); }
        }
        draw(block);
        if (index && index % 150 === 0) await afterPdfPaint();
    }
    return pdf.output('blob');
}

/** Fast sales-document path: vector text and a small cached logo; no page cloning or screenshot. */
export async function exportFastDocumentPdf(element: HTMLElement, filename: string): Promise<boolean> {
    const data = snapshot(element); if (!data) return false;
    const signature = JSON.stringify(data), previous = cache.get(element);
    if (previous?.signature === signature) { saveBlob(previous.blob, filename); return true; }
    const logo = await prepareLogo(element), blob = await createPdf(data, logo);
    cache.set(element, { signature, blob }); saveBlob(blob, filename); return true;
}
