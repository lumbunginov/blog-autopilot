'use strict';
// Pohon elemen Breakdance hasil get-post-tree: { root: {id, data:{type,
// properties}, children:[...]}, _nextNodeId }. Fungsi di sini murni (tanpa
// jaringan) supaya bisa diuji dan dipakai sebelum menyentuh situs.

function rootOf(tree) {
  if (tree && tree.root) return tree.root;
  if (tree && tree.tree && tree.tree.root) return tree.tree.root; // berkas unduhan berpembungkus
  throw new Error('Bukan pohon Breakdance (tidak ada "root")');
}

function walk(node, fn, depth = 0, parent = null) {
  fn(node, depth, parent);
  for (const c of node.children || []) walk(c, fn, depth + 1, node);
}

// id → { node, parent } untuk seluruh pohon.
function index(tree) {
  const m = new Map();
  walk(rootOf(tree), (node, _d, parent) => m.set(node.id, { node, parent }));
  return m;
}

function shortType(t) {
  return String(t || '').split('\\').pop();
}

function textOf(node) {
  const c = node.data && node.data.properties && node.data.properties.content;
  const inner = c && c.content;
  if (!inner) return '';
  return String(inner.text || inner.title || '').replace(/\s+/g, ' ').trim();
}

// Ringkasan satu baris per elemen — cukup untuk menemukan id yang mau
// disunting tanpa membaca JSON pohon yang panjang.
function outline(tree, max = 60) {
  const lines = [];
  walk(rootOf(tree), (node, depth) => {
    if (node.id === 1) return;
    const p = (node.data && node.data.properties) || {};
    const tag = p.settings && p.settings.advanced && p.settings.advanced.tag;
    const t = textOf(node);
    const url = p.content && p.content.content && p.content.content.url;
    lines.push(`${'  '.repeat(depth - 1)}${node.id}  ${shortType(node.data.type)}${tag ? ` <${tag}>` : ''}` +
      `${t ? `  "${t.length > max ? t.slice(0, max) + '…' : t}"` : ''}${url ? `  → ${url}` : ''}`);
  });
  return lines.join('\n');
}

function subtreeIds(node) {
  const ids = [];
  walk(node, n => ids.push(n.id));
  return ids;
}

// Memeriksa semua rujukan id berurutan seperti server menjalankannya, sebelum
// batch dikirim. edit-post sendiri atomik (batch gagal = tidak ada yang
// berubah), tapi galatnya hanya menyebut operasi PERTAMA yang gagal; di sini
// semua kesalahan terkumpul sekaligus tanpa bolak-balik ke situs. Id elemen
// BARU (hasil insert / duplicate) tidak bisa diketahui sebelum dikirim, jadi
// operasi yang merujuknya harus dikirim di batch berikutnya.
function validateOps(tree, operations) {
  if (!Array.isArray(operations) || operations.length === 0) return ['operations kosong atau bukan array'];
  const idx = index(tree);
  const alive = new Set(idx.keys());
  const parentOf = new Map([...idx].map(([id, v]) => [id, v.parent ? v.parent.id : null]));
  const errors = [];
  const need = (i, id, label) => {
    if (id === undefined) return true;
    if (!alive.has(id)) { errors.push(`#${i} ${label} ${id} tidak ada di pohon (sudah dihapus, salah ketik, atau elemen baru dari batch yang sama)`); return false; }
    return true;
  };
  const isDescendant = (id, ancestor) => {
    for (let p = id; p != null; p = parentOf.get(p)) if (p === ancestor) return true;
    return false;
  };

  operations.forEach((o, i) => {
    const p = (o && o.payload) || {};
    switch (o && o.op) {
      case 'insert':
        if (!p.element_type) errors.push(`#${i} insert tanpa element_type`);
        need(i, p.parent_id, 'parent_id');
        break;
      case 'update':
        if (need(i, p.element_id, 'element_id') && (!p.properties || typeof p.properties !== 'object')) {
          errors.push(`#${i} update tanpa properties`);
        }
        break;
      case 'delete':
        if (p.element_id === 1) { errors.push(`#${i} root (id 1) tidak bisa dihapus`); break; }
        if (need(i, p.element_id, 'element_id')) {
          for (const id of subtreeIds(idx.get(p.element_id).node)) alive.delete(id);
        }
        break;
      case 'move':
        if (need(i, p.element_id, 'element_id') && need(i, p.parent_id, 'parent_id')) {
          if (p.parent_id !== undefined && isDescendant(p.parent_id, p.element_id)) {
            errors.push(`#${i} move: ${p.element_id} tidak bisa dipindah ke dalam dirinya sendiri`);
          } else if (p.parent_id !== undefined) {
            parentOf.set(p.element_id, p.parent_id);
          }
        }
        break;
      case 'duplicate':
        need(i, p.element_id, 'element_id');
        break;
      default:
        errors.push(`#${i} op tidak dikenal: ${o && o.op}`);
    }
  });
  return errors;
}

module.exports = { rootOf, index, outline, validateOps, textOf };
