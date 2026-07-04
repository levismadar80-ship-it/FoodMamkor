var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.MehamakorDS;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/Card.tsx
  var Card_exports = {};
  __export(Card_exports, {
    Active: () => Active,
    Default: () => Default,
    Flat: () => Flat
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.MehamakorDS;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/Card.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  function Default() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Card, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 18 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Heading, { level: 3, variant: "editorial", children: "מאפיית לחם מחמצת" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { marginTop: 8, color: "#5c584f", lineHeight: 1.6 }, children: "לחם מחמצת אפוי בתנור אבן, נאפה טרי כל בוקר משכונת המושבה." }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12, display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Badge, { variant: "primary", children: "מאומת" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Badge, { variant: "muted", children: "אורגני" })
      ] })
    ] }) });
  }
  function Active() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Card, { active: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 18 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Heading, { level: 3, variant: "editorial", children: "כרטיס נבחר" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { marginTop: 8, color: "#5c584f" }, children: "מצב active — גבול מודגש." })
    ] }) });
  }
  function Flat() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Card, { variant: "flat", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 18 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.Heading, { level: 3, variant: "sans", children: "כרטיס שטוח" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { marginTop: 8, color: "#5c584f" }, children: 'variant="flat" — ללא גבול.' })
    ] }) });
  }
  return __toCommonJS(Card_exports);
})();
