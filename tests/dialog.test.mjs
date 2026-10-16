import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function dialogs() {
    const source = readFileSync(new URL('../utils/dialog.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    vm.runInNewContext(outputText, { exports });
    return exports;
}
test('confirmation runs the action only after explicit acceptance', async () => {
    const dialog = dialogs();
    let actions = 0;
    const pending = dialog.confirmAction('Save this sale?').then(accepted => { if (accepted) actions++; });
    assert.equal(actions, 0);
    dialog.resolveDialog(dialog.currentDialog().id, false);
    await pending;
    assert.equal(actions, 0);
    const accepted = dialog.confirmAction('Save this sale?').then(result => { if (result) actions++; });
    const id = dialog.currentDialog().id;
    dialog.resolveDialog(id, true);
    dialog.resolveDialog(id, true);
    await accepted;
    assert.equal(actions, 1);
});
test('duplicate invocation cannot save twice and different requests stay queued', async () => {
    const dialog = dialogs();
    const first = dialog.confirmAction({ title: 'Save', message: 'Save profile' });
    assert.equal(await dialog.confirmAction('Save profile'), false);
    const second = dialog.confirmAction('Delete profile');
    const id = dialog.currentDialog().id;
    dialog.resolveDialog(id, true);
    assert.equal(await first, true);
    assert.equal(dialog.currentDialog().message, 'Delete profile');
    dialog.resolveDialog(id, true);
    assert.equal(dialog.currentDialog().message, 'Delete profile');
    dialog.cancelDialogs();
    assert.equal(await second, false);
});
test('navigation or teardown cancels outstanding input and confirmation requests', async () => {
    const dialog = dialogs();
    const input = dialog.requestText({ message: 'Enter IMEIs', multiline: true });
    const confirmation = dialog.confirmAction('Save changes');
    dialog.cancelDialogs();
    assert.equal(await input, null);
    assert.equal(await confirmation, false);
    assert.equal(dialog.currentDialog(), null);
});
test('multiline input preserves entered serial numbers and subscribers are cleaned up', async () => {
    const dialog = dialogs();
    let updates = 0;
    const unsubscribe = dialog.subscribeDialogs(() => updates++);
    const input = dialog.requestText({ message: 'Enter IMEIs', multiline: true });
    dialog.resolveDialog(dialog.currentDialog().id, '012345678901234\n123456789012345');
    assert.equal(await input, '012345678901234\n123456789012345');
    assert.equal(updates, 2);
    unsubscribe();
    const notice = dialog.notifyDialog('Export failed');
    dialog.resolveDialog(dialog.currentDialog().id, true);
    await notice;
    assert.equal(updates, 2);
});
