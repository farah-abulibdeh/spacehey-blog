/* garden.js — tiny template runtime for [YOUR NAME]'s garden.
   Renders the <x-dc> template on each page with {{holes}}, <sc-for>, <sc-if>
   and onClick/onChange handlers from the page's Component class. */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(scope, p);
      return v == null ? '' : String(v);
    });
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this.__save) this.__save();
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };

  var EVENTS = { onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit', onkeydown: 'keydown' };

  function build(node, scope, parentNS, out) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interp(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      var listAttr = node.getAttribute('list') || '';
      var m = listAttr.match(WHOLE);
      var list = m ? lookup(scope, m[1]) : [];
      var as = node.getAttribute('as') || 'item';
      (list || []).forEach(function (item, idx) {
        var s = Object.create(scope);
        s[as] = item;
        s.$index = idx;
        node.childNodes.forEach(function (c) { build(c, s, parentNS, out); });
      });
      return;
    }
    if (tag === 'sc-if') {
      var vm = (node.getAttribute('value') || '').match(WHOLE);
      if (vm && lookup(scope, vm[1])) node.childNodes.forEach(function (c) { build(c, scope, parentNS, out); });
      return;
    }
    var ns = node.namespaceURI === SVG_NS ? SVG_NS : null;
    var el = ns ? document.createElementNS(SVG_NS, node.localName) : document.createElement(tag);
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      var name = a.name, val = a.value;
      if (name.indexOf('hint-') === 0) continue;
      if (EVENTS[name]) {
        var hm = val.match(WHOLE);
        var fn = hm ? lookup(scope, hm[1]) : null;
        if (typeof fn === 'function') el.addEventListener(EVENTS[name], fn);
        continue;
      }
      var wm = val.match(WHOLE);
      var v = wm ? lookup(scope, wm[1]) : interp(val, scope);
      if (name === 'value' && (tag === 'input' || tag === 'textarea')) { el.value = v == null ? '' : v; continue; }
      if (v === false || v == null) { if (name.indexOf('aria-') === 0) el.setAttribute(name, 'false'); continue; }
      el.setAttribute(name, v === true ? (name.indexOf('aria-') === 0 ? 'true' : '') : String(v));
    }
    node.childNodes.forEach(function (c) { build(c, scope, ns, el); });
    out.appendChild(el);
  }

  function boot() {
    var host = document.querySelector('x-dc');
    var scriptEl = document.querySelector('script[data-dc-script]');
    if (!host || !scriptEl) return;
    var helmet = host.querySelector('helmet');
    if (helmet) Array.prototype.slice.call(helmet.children).forEach(function (c) { document.head.appendChild(c); });
    var tpl = document.createElement('div');
    Array.prototype.slice.call(host.childNodes).forEach(function (c) { tpl.appendChild(c); });
    var defs = {};
    try { defs = JSON.parse(scriptEl.getAttribute('data-props') || '{}'); } catch (e) {}
    var props = {};
    Object.keys(defs).forEach(function (k) { if (k[0] !== '$' && defs[k] && 'default' in defs[k]) props[k] = defs[k].default; });
    var Component = new Function('DCLogic', scriptEl.textContent + '\nreturn Component;')(DCLogic);
    var comp = new Component(props);
    var key = 'garden:' + (document.body.getAttribute('data-page') || location.pathname);
    var keep = comp.persistKeys || [];
    if (keep.length) {
      try {
        var saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved) keep.forEach(function (k) { if (k in saved) comp.state[k] = saved[k]; });
      } catch (e) {}
      comp.__save = function () {
        var o = {}; keep.forEach(function (k) { o[k] = comp.state[k]; });
        try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {}
      };
    }
    comp.__render = function () {
      var active = document.activeElement, idx = -1, selS = null, selE = null;
      if (active && host.contains(active) && /^(INPUT|TEXTAREA|BUTTON)$/.test(active.tagName)) {
        var all = host.querySelectorAll('input, textarea, button');
        idx = Array.prototype.indexOf.call(all, active);
        try { selS = active.selectionStart; selE = active.selectionEnd; } catch (e) {}
      }
      var frag = document.createDocumentFragment();
      var vals = comp.renderVals();
      tpl.childNodes.forEach(function (c) { build(c, vals, null, frag); });
      host.innerHTML = '';
      host.appendChild(frag);
      if (idx >= 0) {
        var again = host.querySelectorAll('input, textarea, button')[idx];
        if (again) { again.focus(); try { if (selS != null) again.setSelectionRange(selS, selE); } catch (e) {} }
      }
    };
    host.style.display = 'block';
    comp.__render();
    if (comp.componentDidMount) comp.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
