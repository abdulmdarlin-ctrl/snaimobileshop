import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../utils/printExport.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function exporter(paperWidth, height) {
    const output = [];
    const document = { body: { style: {} }, querySelector: () => ({ classList: { contains: value => value === 'receipt-mode' }, dataset: { paperWidth }, scrollWidth: 400, scrollHeight: height }) };
    class PDF { constructor(options) { this.options = options; this.pages = 1; this.images = []; output.push(this); } addImage(...args) { this.images.push(args); } addPage() { this.pages++; } save(name) { this.filename = name; } }
    const dependencies = { './fastDocumentPdf': { afterPdfPaint: async () => {}, exportFastDocumentPdf: async () => false }, jspdf: { jsPDF: PDF }, html2canvas: { default: async () => ({ width: 400, height, toDataURL: () => 'data:image/png;base64,fixture' }) }, './dialog': { notifyDialog: message => assert.fail(message) } };
    const exports = {};
    vm.runInNewContext(outputText, { exports, document, console, require: name => dependencies[name] });
    return { run: () => exports.exportSectionToPDF('#document', 'receipt.pdf'), output, document };
}
test('long thermal invoices include the entire document instead of clipping after 297 mm', async () => {
    const f = exporter('80', 2400); await f.run();
    assert.equal(f.output[0].options.format[0], 80);
    assert.equal(f.output[0].options.format[1], 480);
    assert.equal(f.output[0].images[0][5], 480);
    assert.equal(f.output[0].filename, 'receipt.pdf');
    assert.equal(f.document.body.style.cursor, 'default');
});
test('58 mm paper and exceptionally long documents retain the correct width on every page', async () => {
    const f = exporter('58', 30000); await f.run();
    assert.equal(f.output[0].options.format[0], 58);
    assert.equal(f.output[0].options.format[1], 3000);
    assert.equal(f.output[0].pages, 2);
    assert.equal(f.output[0].images[1][3], -3000);
    assert.equal(f.output[0].images[1][4], 58);
});
